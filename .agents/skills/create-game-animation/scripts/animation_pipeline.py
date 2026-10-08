#!/usr/bin/env python3
"""Resumable animation assets. POST requests are NEVER automatically retried."""
from __future__ import annotations

import argparse
import base64
import concurrent.futures as futures
import contextlib
import fcntl
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from urllib import error, parse, request

VIDEO_MODEL = "xai/grok-imagine-video/v1.5/lite/text-to-video"
LEGACY_VIDEO_MODEL = "xai/grok-imagine-video/v1.5/lite/image-to-video"
MATTE_MODEL = "fal-ai/feynobg"
QUEUE_BASE = "https://queue.fal.run/"
BLOCKED = {"failed", "unknown", "submitting"}


class PipelineError(Exception):
    pass


class MissingKey(PipelineError):
    pass


class SubmissionUnknown(PipelineError):
    pass


class PendingRequest(PipelineError):
    pass


def now():
    return datetime.now(timezone.utc).isoformat()


def pillow():
    try:
        from PIL import Image, ImageDraw, features
    except ImportError:
        raise PipelineError("Pillow is missing. Install it in your tools Python environment: python3 -m pip install Pillow")
    return Image, ImageDraw, features


def atomic_bytes(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    with temporary.open("wb") as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    temporary.replace(path)


def atomic_json(path, value):
    atomic_bytes(path, (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode())


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def project_root(explicit=None):
    if explicit:
        return Path(explicit).resolve()
    for parent in (Path.cwd(), *Path.cwd().parents):
        if (parent / "GAME_CONCEPT.md").is_file() and (parent / "client").is_dir():
            return parent
    raise PipelineError("Run inside sword-puzzle or pass --root /path/to/sword-puzzle.")


def load_key(root):
    # Parse only the one needed variable; never source/execute a dotenv file.
    if "FAL_KEY" in os.environ:
        return os.environ["FAL_KEY"].strip()
    env_path = Path(root) / ".env"
    if env_path.is_file():
        for line in env_path.read_text().splitlines():
            match = re.match(r"^\s*(?:export\s+)?FAL_KEY\s*=\s*(.*?)\s*$", line)
            if match:
                value = match.group(1)
                if value[:1] in {"'", '"'} and value[-1:] == value[:1]:
                    return value[1:-1].strip()
                return value.split(" #", 1)[0].strip()
    return ""


def binary(name):
    candidate = os.environ.get(name.upper() + "_BIN") or shutil.which(name)
    if not candidate or not Path(candidate).is_file() or not os.access(candidate, os.X_OK):
        raise PipelineError(f"{name} is missing. Install FFmpeg (macOS: brew install ffmpeg), or set {name.upper()}_BIN to its executable.")
    return str(candidate)


def doctor(root):
    Image, _, features = pillow()
    result = {"python": sys.version.split()[0], "pillow": Image.__version__,
              "webp_animation": features.check("webp"), "fal_key_present": bool(load_key(root))}
    for name in ("ffmpeg", "ffprobe"):
        try:
            result[name] = binary(name)
        except PipelineError as exc:
            result[name] = str(exc)
    result["ready"] = all(Path(result[name]).is_file() for name in ("ffmpeg", "ffprobe")) and result["webp_animation"]
    return result


class Job:
    """One process per job; one serialized, atomic manifest writer per process."""
    def __init__(self, path):
        self.path = Path(path).resolve()
        self.lock = threading.RLock()
        self.data = json.loads((self.path / "manifest.json").read_text())

    def save(self):
        with self.lock:
            self.data["updated_at"] = now()
            atomic_json(self.path / "manifest.json", self.data)

    def file(self, relative):
        path = (self.path / relative).resolve()
        if not path.is_relative_to(self.path):
            raise PipelineError("Artifact path escapes the animation job.")
        return path

    @contextlib.contextmanager
    def exclusive(self):
        handle = (self.path / ".pipeline.lock").open("a")
        try:
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise PipelineError("This job is already running. Do not start a second process.")
            # Reload AFTER acquiring the lock: another process may just have finished.
            self.data = json.loads((self.path / "manifest.json").read_text())
            yield self
        finally:
            handle.close()


def init_job(root, slug, description, image=None, image_prompt=None, video_prompt=None,
             kind="other", duration=2, playback_ms=None, frame_count=24, size=256, columns=6, padding=2):
    pillow()
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        raise PipelineError("Use a lowercase hyphenated animation ID.")
    if duration not in (1, 2) or frame_count < 3 or size < 1 or columns < 1 or padding < 0:
        raise PipelineError("Duration must be 1 or 2; frames >= 3; size/columns > 0; padding >= 0.")
    if playback_ms is not None and playback_ms < 1:
        raise PipelineError("Playback duration must be positive.")
    inputs = {"source.png": image, "image.prompt.txt": image_prompt, "video.prompt.txt": video_prompt}
    for source in inputs.values():
        if source and not Path(source).is_file():
            raise PipelineError(f"Input file not found: {source}")
    if image:
        Image, _, _ = pillow()
        with Image.open(image) as opened:
            opened.verify()
    path = Path(root) / "assets" / "animation-source" / slug
    try:
        path.mkdir(parents=True, exist_ok=False)
    except FileExistsError:
        raise PipelineError("Animation ID exists. Resume it; do not create a new ID to bypass retry approval.")
    for target, source in inputs.items():
        if source:
            if target == "source.png":
                with Image.open(source) as opened:
                    opened.convert("RGB").save(path / target)
            else:
                shutil.copyfile(source, path / target)
    atomic_json(path / "manifest.json", {
        "version": 2, "id": slug, "description": description, "kind": kind,
        "created_at": now(), "state": "prepared",
        "config": {"video_model": VIDEO_MODEL, "generation_mode": "text-to-video",
                   "resolution": "480p", "aspect_ratio": "1:1", "video_duration": duration,
                   "safe_bounds": [0.1, 0.1, 0.9, 0.9], "alpha_threshold": 8,
                   "pack_mode": "full-canvas", "frame_sampling": "inclusive",
                   "matte_model": MATTE_MODEL, "matte_seed": 42, "frame_count": frame_count,
                   "size": size, "columns": columns, "padding": padding,
                   "playback_ms": playback_ms or (800 if kind == "fire" else 1000)},
        "video": {}, "frames": [], "video_review": None, "sample_review": None,
    })
    return Job(path)


class NoRedirect(request.HTTPRedirectHandler):
    # No redirect replay of a billable POST, and no forwarding of credentials.
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class FalAPI:
    def __init__(self, key, poll_interval=2, timeout=300):
        self.key = key
        self.poll_interval = poll_interval
        self.timeout = timeout
        self.opener = request.build_opener(NoRedirect())

    def json_request(self, url, payload=None):
        parsed = parse.urlparse(url)
        if parsed.scheme != "https" or parsed.netloc != "queue.fal.run":
            raise PipelineError("Refusing to send fal credentials to a non-queue URL.")
        method = "POST" if payload is not None else "GET"
        body = json.dumps(payload).encode() if payload is not None else None
        req = request.Request(url, data=body, method=method,
                              headers={"Authorization": "Key " + self.key, "Content-Type": "application/json"})
        try:
            with self.opener.open(req, timeout=min(self.timeout, 60)) as response:
                return json.load(response)
        except error.HTTPError as exc:
            # Do not print HTTP bodies: they may contain uploaded base64 images or credentials.
            if method == "GET" and (exc.code in (401, 403, 404, 408, 429) or exc.code >= 500):
                raise PendingRequest(f"Cannot read the existing fal request (HTTP {exc.code}). Fix the issue and resume the same ID.")
            raise PipelineError(f"fal {method} returned HTTP {exc.code}; no automatic resubmission.")
        except (error.URLError, TimeoutError, OSError, ValueError):
            if method == "POST":
                raise SubmissionUnknown("Submission outcome unknown. Do not resubmit without explicit user approval.")
            raise PendingRequest("Cannot read the existing request yet. Resume polling; do not resubmit.")

    def submit(self, model, payload):
        response = self.json_request(QUEUE_BASE + model, payload)
        if not response.get("request_id"):
            raise SubmissionUnknown("Submit response had no request ID. Approval is required before resubmitting.")
        request_id = response["request_id"]
        base = QUEUE_BASE + model + "/requests/" + parse.quote(request_id, safe="")
        return {"request_id": request_id, "status_url": response.get("status_url", base + "/status"),
                "response_url": response.get("response_url", base)}

    def wait(self, record):
        deadline = time.monotonic() + self.timeout
        while time.monotonic() < deadline:
            status = self.json_request(record["status_url"])
            if status.get("status") == "COMPLETED":
                if status.get("error") or status.get("error_type"):
                    raise PipelineError("fal reports this request failed. Approval is required for a new attempt.")
                return self.json_request(record["response_url"])
            if status.get("status") not in {"IN_QUEUE", "IN_PROGRESS"}:
                raise PendingRequest("Unexpected queue status. Keep the request ID and inspect before proceeding.")
            time.sleep(min(self.poll_interval, max(0, deadline - time.monotonic())))
        raise PendingRequest("Polling timed out. The request is retained; resume to poll the same ID.")


def data_uri(path):
    return "data:image/png;base64," + base64.b64encode(Path(path).read_bytes()).decode()


def download(url):
    if url.startswith("data:"):
        header, content = url.split(",", 1)
        if ";base64" not in header:
            raise PipelineError("Unsupported artifact data URI.")
        return base64.b64decode(content, validate=True)
    if parse.urlparse(url).scheme != "https":
        raise PipelineError("fal artifact download must use HTTPS.")
    # Artifact fetches deliberately do not carry FAL_KEY.
    try:
        with request.urlopen(url, timeout=60) as response:
            return response.read()
    except (error.URLError, OSError):
        raise PendingRequest("Artifact download failed. Resume download of the existing request; do not resubmit.")


def run_request(job, record, model, payload, output_kind, api, stop):
    """A worker owns one record; manifest writes and submission gates share a lock."""
    try:
        with job.lock:
            if record.get("state") == "completed":
                output = job.file(record["output"])
                if output.is_file() and sha256(output) == record.get("output_sha256"):
                    return
                # Recover a missing/corrupted local file from the ORIGINAL result.
                record["state"] = "pending"
            if record.get("state") in BLOCKED:
                raise PipelineError("A previous attempt is failed/uncertain. Explicit user retry approval is required.")
            if stop.is_set():
                return
            if not record.get("request_id"):
                # Persist intent BEFORE any POST: a crash cannot silently duplicate it.
                record.update(state="submitting", submitted_at=now(), attempt=record.get("attempt", 1))
                job.save()
        if not record.get("request_id"):
            submitted = api.submit(model, payload)
            with job.lock:
                record.update(submitted, state="pending")
                job.save()
        result = api.wait(dict(record))
        artifact = result.get(output_kind, {})
        if not artifact.get("url"):
            raise PipelineError("fal result is missing its artifact URL. Keep the request ID; do not resubmit.")
        contents = download(artifact["url"])
        if output_kind == "image":
            Image, _, _ = pillow()
            with Image.open(io.BytesIO(contents)) as cutout:
                if "A" not in cutout.getbands():
                    raise PipelineError("Feyn returned an image without alpha. Inspect before approving any retry.")
                with Image.open(job.file(record["raw"])) as raw:
                    if cutout.size != raw.size:
                        raise PipelineError("Feyn changed the frame dimensions; inspect alignment before proceeding.")
                if cutout.getchannel("A").getextrema()[0] == 255:
                    raise PipelineError("Feyn output is fully opaque; background removal needs review.")
                buffer = io.BytesIO()
                cutout.convert("RGBA").save(buffer, "PNG")
                contents = buffer.getvalue()
            relative = f"cutouts/{record['index']:04d}-attempt-{record.get('attempt', 1)}.png"
        else:
            relative = f"video/attempt-{record.get('attempt', 1)}.mp4"
        atomic_bytes(job.file(relative), contents)
        with job.lock:
            record.update(state="completed", output=relative, output_sha256=sha256(job.file(relative)), completed_at=now())
            record.pop("error", None)
            job.save()
    except Exception as exc:
        # Set this inside the worker, BEFORE the scheduler can refill its slot.
        with job.lock:
            stop.set()
            if record.get("state") != "completed":
                if record.get("request_id") and (isinstance(exc, PendingRequest) or not isinstance(exc, PipelineError)):
                    state = "pending"
                else:
                    state = "unknown" if isinstance(exc, SubmissionUnknown) or (record.get("state") == "submitting" and not record.get("request_id") and not isinstance(exc, PipelineError)) else "failed"
                record.update(state=state, error=str(exc) if isinstance(exc, PipelineError) else "Local processing failed; inspect this request before proceeding.")
            job.data["state"] = "needs_attention"
            job.save()
        raise


def require_api(job, supplied=None, **options):
    if supplied:
        return supplied
    root = job.path.parents[2]
    key = load_key(root)
    if not key:
        job.data["state"] = "awaiting_key"
        job.save()
        raise MissingKey("Set FAL_KEY in the project .env or process environment, then resume. No request was submitted.")
    return FalAPI(key, **options)


def generate_video(job, api=None, **options):
    record = job.data["video"]
    if record.get("state") == "imported":
        return
    prompt_file = job.file("video.prompt.txt")
    if not prompt_file.is_file():
        raise PipelineError("Create video.prompt.txt before video generation.")
    prompt = prompt_file.read_text().strip()
    if not prompt or len(prompt) > 4096:
        raise PipelineError("Video prompt must contain 1–4096 characters.")
    config = job.data["config"]
    if config["video_duration"] not in (1, 2):
        raise PipelineError("Video generation is limited to 1 or 2 seconds; refusing a longer request.")
    model = config.get("video_model", LEGACY_VIDEO_MODEL)
    if record.get("model") and record["model"] != model:
        raise PipelineError("Video endpoint changed. Restore the original job configuration.")
    if config.get("resolution", "480p") != "480p":
        raise PipelineError("Video generation is limited to 480p.")
    payload = {"prompt": prompt, "resolution": "480p", "duration": config["video_duration"]}
    if model == VIDEO_MODEL:
        if config.get("generation_mode") != "text-to-video" or config.get("aspect_ratio") != "1:1":
            raise PipelineError("Text-to-video jobs require generation_mode=text-to-video and aspect_ratio=1:1.")
        payload["aspect_ratio"] = "1:1"
    elif model == LEGACY_VIDEO_MODEL:
        image = job.file("source.png")
        if not image.is_file():
            raise PipelineError("Legacy image-to-video jobs still require their original source.png.")
        payload["image_url"] = data_uri(image)
    else:
        raise PipelineError("Unsupported video endpoint; do not change models to bypass retry approval.")
    signature = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    if record.get("signature") and record["signature"] != signature:
        raise PipelineError("Generation inputs changed. Do not overwrite an existing attempt; request an approved revision.")
    if record.get("state") == "completed" and job.file(record["output"]).is_file() and sha256(job.file(record["output"])) == record.get("output_sha256"):
        return
    api = require_api(job, api, **options)
    record.update(signature=signature, model=model)
    job.data["state"] = "generating_video"
    job.save()
    run_request(job, record, model, payload, "video", api, threading.Event())
    job.data["state"] = "video_ready"
    job.save()


def attach_video(job, path):
    path = Path(path).resolve()
    if not path.is_file():
        raise PipelineError("Video not found.")
    digest = sha256(path)
    current = job.data["video"]
    if current.get("output_sha256") == digest:
        return
    if job.data["frames"]:
        raise PipelineError("Frames already exist. Use a new, explicitly requested revision for a different video.")
    relative = "video/imported" + path.suffix.lower()
    atomic_bytes(job.file(relative), path.read_bytes())
    job.data["video"] = {"state": "imported", "output": relative, "output_sha256": digest, "previous_generation": current}
    job.data["state"] = "video_ready"
    job.save()


def video_file(job):
    record = job.data["video"]
    if record.get("state") not in {"completed", "imported"}:
        raise PipelineError("Generate or attach a video first.")
    path = job.file(record["output"])
    if not path.is_file() or sha256(path) != record["output_sha256"]:
        raise PipelineError("Source video is missing or changed; restore it before continuing.")
    return path


def media_command(args):
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode:
        raise PipelineError("Media command failed: " + result.stderr[-1500:])
    return result.stdout


def probe(path):
    info = json.loads(media_command([binary("ffprobe"), "-v", "error", "-select_streams", "v:0", "-show_streams", "-show_format", "-of", "json", str(path)]))
    if not info.get("streams"):
        raise PipelineError("No video stream found.")
    stream = info["streams"][0]
    duration = float(stream.get("duration") or info.get("format", {}).get("duration") or 0)
    rate = stream.get("avg_frame_rate", "0/1").split("/")
    fps = float(rate[0]) / (float(rate[1]) or 1)
    if not math.isfinite(duration) or duration <= 0 or fps <= 0:
        raise PipelineError("Video duration/frame rate is invalid.")
    return {"duration": duration, "fps": fps, "width": stream["width"], "height": stream["height"]}


def capture(video, timestamp, output):
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    media_command([binary("ffmpeg"), "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", str(video), "-ss", f"{timestamp:.6f}", "-frames:v", "1", str(output)])
    if not output.is_file():
        raise PipelineError("FFmpeg did not produce a frame; choose an earlier timestamp.")


def contact(paths, target, labels=None, background=(24, 36, 43), columns=6):
    Image, ImageDraw, _ = pillow()
    width, height = 144, 166
    sheet = Image.new("RGB", (columns * width, math.ceil(len(paths) / columns) * height), background)
    draw = ImageDraw.Draw(sheet)
    for index, path in enumerate(paths):
        with Image.open(path) as source:
            image = source.convert("RGBA")
            image.thumbnail((136, 136), Image.Resampling.LANCZOS)
            x = index % columns * width + (width - image.width) // 2
            y = index // columns * height + (140 - image.height) // 2
            sheet.paste(image, (x, y), image)
            draw.text((index % columns * width + 5, index // columns * height + 144), labels[index] if labels else f"{index:02d}", fill=(130, 150, 160))
    sheet.save(target)


def inspect_video(job, attached=None):
    if attached:
        attach_video(job, attached)
    video = video_file(job)
    info = probe(video)
    job.data["video"]["probe"] = info
    job.save()
    paths, labels = [], []
    for index in range(9):
        timestamp = index / 8 * max(0, info["duration"] - 1 / info["fps"])
        output = job.file(f"inspection/{index:02d}.png")
        capture(video, timestamp, output)
        paths.append(output)
        labels.append(f"{timestamp:.3f}s")
    contact(paths, job.file("video-contact.png"), labels, columns=3)
    return info


def extract(job, start=0, end=None):
    Image, _, _ = pillow()
    video = video_file(job)
    info = probe(video)
    if job.data["config"].get("pack_mode") == "full-canvas" and info["width"] != info["height"]:
        raise PipelineError("A square video is required for the 500x500 composition; inspect the source before proceeding.")
    if end is None:
        end = info["duration"] if job.data["video"]["state"] == "imported" else min(info["duration"], job.data["config"]["video_duration"])
    if not all(math.isfinite(x) for x in (start, end)) or not 0 <= start < end <= info["duration"] + .001:
        raise PipelineError("Trim range must satisfy 0 <= start < end <= video duration.")
    selection = {"video_sha256": sha256(video), "start": start, "end": end, "count": job.data["config"]["frame_count"]}
    if job.data.get("selection") and job.data["selection"] != selection:
        raise PipelineError("Frame selection changed. Use a new revision; timing/crop-only edits belong in pack.")
    job.data["selection"] = selection
    job.data["video"]["probe"] = info
    for index in range(selection["count"]):
        if index < len(job.data["frames"]):
            record = job.data["frames"][index]
            if not job.file(record["raw"]).is_file() or sha256(job.file(record["raw"])) != record["raw_sha256"]:
                raise PipelineError("An extracted frame is missing or changed. Restore it before using cached requests.")
            continue
        if job.data["config"].get("frame_sampling") == "inclusive":
            # Include the first and last available frames inside the selected range.
            last = max(start, end - 1 / info["fps"])
            timestamp = start + index * (last - start) / (selection["count"] - 1)
        else:
            # Preserve existing jobs' frame timestamps and cached matting inputs.
            timestamp = min(start + index * (end - start) / selection["count"], max(0, info["duration"] - 1 / info["fps"]))
        relative = f"frames/{index:04d}.png"
        capture(video, timestamp, job.file(relative))
        with Image.open(job.file(relative)) as image:
            dimensions = list(image.size)
        job.data["frames"].append({"index": index, "timestamp": timestamp, "raw": relative,
                                   "raw_sha256": sha256(job.file(relative)), "dimensions": dimensions, "state": "new"})
        job.save()
    job.data["state"] = "frames_ready"
    job.save()
    contact([job.file(row["raw"]) for row in job.data["frames"]], job.file("frames-contact.png"))


def sample_indices(job):
    count = len(job.data["frames"])
    if not count:
        return []
    return sorted({min(count - 1, count // 4), count // 2, min(count - 1, count * 3 // 4)})


def sample_signature(job):
    return [job.data["frames"][i].get("output_sha256") for i in sample_indices(job)]


def sample_contact(job):
    Image, ImageDraw, _ = pillow()
    indices = sample_indices(job)
    sheet = Image.new("RGB", (144 * 3, 166 * len(indices)), (24, 36, 43))
    draw = ImageDraw.Draw(sheet)
    for row, index in enumerate(indices):
        frame = job.data["frames"][index]
        for column, (path, bg) in enumerate(((frame["raw"], (24, 36, 43)), (frame["output"], (24, 36, 43)), (frame["output"], (235, 235, 235)))):
            tile = Image.new("RGBA", (144, 144), bg + (255,))
            with Image.open(job.file(path)) as image:
                image = image.convert("RGBA")
                image.thumbnail((136, 136), Image.Resampling.LANCZOS)
                tile.alpha_composite(image, ((144 - image.width) // 2, (144 - image.height) // 2))
            sheet.paste(tile.convert("RGB"), (column * 144, row * 166))
            draw.text((column * 144 + 4, row * 166 + 145), f"{index:02d} " + ("source", "dark", "light")[column], fill=(140, 160, 170))
    sheet.save(job.file("sample-review.png"))


def video_review_signature(job):
    video = video_file(job)
    frames = job.data["frames"]
    if len(frames) != job.data["config"]["frame_count"]:
        raise PipelineError("Extract all frames before recording the video review.")
    for row in frames:
        if not job.file(row["raw"]).is_file() or sha256(job.file(row["raw"])) != row["raw_sha256"]:
            raise PipelineError("Raw frame changed; restore it before reviewing or matting.")
    return {"video_sha256": sha256(video), "selection": job.data.get("selection"),
            "frames": [row["raw_sha256"] for row in frames]}


def review_video(job, passed, note):
    job.data["video_review"] = {"passed": passed, "note": note, "at": now(),
                                "signature": video_review_signature(job)}
    job.data["state"] = "video_passed" if passed else "needs_attention"
    job.save()


def require_video_review(job):
    if job.data["config"].get("pack_mode") != "full-canvas":
        return  # Legacy jobs keep their existing review workflow.
    review = job.data.get("video_review") or {}
    if not review.get("passed") or review.get("signature") != video_review_signature(job):
        raise PipelineError("Inspect the video and extracted first/peak/fade/last frames, then record review --stage video --pass before Feyn or export.")


def check_safe_bounds(images, bounds, threshold, label="source"):
    """Check visible alpha; faint glow still needs visual review."""
    for index, image in enumerate(images):
        width, height = image.size
        allowed = (math.ceil(width * bounds[0]), math.ceil(height * bounds[1]),
                   math.floor(width * bounds[2]), math.floor(height * bounds[3]))
        visible = image.getchannel("A").point(lambda alpha: 255 if alpha > threshold else 0).getbbox()
        if visible and (visible[0] < allowed[0] or visible[1] < allowed[1] or
                        visible[2] > allowed[2] or visible[3] > allowed[3]):
            raise PipelineError(f"Frame {index} ({label}) visible alpha exceeds the central 80% safe region: {visible}, allowed {allowed}. Inspect artifacts; no automatic paid retry.")


def matte(job, stage="sample", concurrency=4, api=None, **options):
    if concurrency < 1:
        raise PipelineError("Concurrency must be positive.")
    frames = job.data["frames"]
    if len(frames) != job.data["config"]["frame_count"]:
        raise PipelineError("Extract all frames first.")
    require_video_review(job)
    signature = {"model": MATTE_MODEL, "seed": job.data["config"]["matte_seed"],
                 "inputs": [row["raw_sha256"] for row in frames]}
    if job.data.get("matte_signature") and job.data["matte_signature"] != signature:
        raise PipelineError("Matting inputs/configuration changed. Do not bypass retry approval by changing the seed or source.")
    job.data["matte_signature"] = signature
    if any(row.get("state") in BLOCKED for row in frames):
        raise PipelineError("A failed/uncertain frame blocks new submissions. Request approval for that specific retry.")
    if stage == "remaining":
        review = job.data.get("sample_review") or {}
        if not review.get("passed") or review.get("signature") != sample_signature(job):
            raise PipelineError("Inspect sample-review.png, then record a passing sample review before processing the rest.")
    selected = [frames[i] for i in sample_indices(job)] if stage == "sample" else frames
    pending = []
    for row in selected:
        if not job.file(row["raw"]).is_file() or sha256(job.file(row["raw"])) != row["raw_sha256"]:
            raise PipelineError("Raw frame changed; refusing to reuse or submit mismatched inputs.")
        if row.get("state") == "completed" and job.file(row["output"]).is_file() and sha256(job.file(row["output"])) == row.get("output_sha256"):
            continue
        pending.append(row)
    if pending:
        api = require_api(job, api, **options)
        stop = threading.Event()
        errors = []
        def launch(pool, row):
            payload = {"image_url": data_uri(job.file(row["raw"])), "seed": job.data["config"]["matte_seed"]}
            return pool.submit(run_request, job, row, MATTE_MODEL, payload, "image", api, stop)
        job.data["state"] = "matting_" + stage
        job.save()
        with futures.ThreadPoolExecutor(max_workers=concurrency) as pool:
            # Recovery is a barrier: resolve old requests before any new paid POST.
            for batch in ([row for row in pending if row.get("request_id")],
                          [row for row in pending if not row.get("request_id")]):
                iterator = iter(batch)
                active = set()
                for _ in range(min(concurrency, len(batch))):
                    row = next(iterator)
                    if not stop.is_set():
                        active.add(launch(pool, row))
                while active:
                    done, active = futures.wait(active, return_when=futures.FIRST_COMPLETED)
                    for future in done:
                        try:
                            future.result()
                        except Exception as exc:
                            errors.append(exc)
                    if not stop.is_set():
                        for _ in done:
                            row = next(iterator, None)
                            if row is not None:
                                active.add(launch(pool, row))
        if errors:
            raise PipelineError("Processing stopped; in-flight results were saved. " + str(errors[0]))
    if stage == "sample":
        sample_contact(job)
        job.data["state"] = "sample_needs_review"
    else:
        job.data["state"] = "cutouts_ready"
    job.save()


def review_samples(job, passed, note):
    indices = sample_indices(job)
    if not indices or not all(job.data["frames"][i].get("state") == "completed" for i in indices):
        raise PipelineError("Complete the three sample cutouts before review.")
    if passed and job.data["config"].get("pack_mode") == "full-canvas":
        Image, _, _ = pillow()
        for index in indices:
            with Image.open(job.file(job.data["frames"][index]["output"])) as image:
                check_safe_bounds([image.convert("RGBA")], job.data["config"]["safe_bounds"],
                                  job.data["config"]["alpha_threshold"], label=f"sample frame {index}")
    job.data["sample_review"] = {"passed": passed, "note": note, "at": now(), "signature": sample_signature(job)}
    job.data["state"] = "sample_passed" if passed else "needs_attention"
    job.save()


def retry_approved(job, target, approval, api=None, **options):
    if not approval.strip():
        raise PipelineError("Record the user's explicit approval for this specific paid retry.")
    if target == "video":
        if job.data["frames"]:
            raise PipelineError("A video revision with extracted frames needs a separate explicitly approved job.")
        record = job.data["video"]
        if record.get("state") == "imported":
            raise PipelineError("An imported video has no request to retry.")
    else:
        match = re.fullmatch(r"frame:(\d+)", target)
        if not match or int(match.group(1)) >= len(job.data["frames"]):
            raise PipelineError("Target must be video or frame:<zero-based-index>.")
        record = job.data["frames"][int(match.group(1))]
    if record.get("state") not in BLOCKED | {"completed"}:
        raise PipelineError("This target is new or still pending; resume its existing request instead of retrying.")
    api = require_api(job, api, **options)
    if target != "video" and (not job.file(record["raw"]).is_file() or sha256(job.file(record["raw"])) != record["raw_sha256"]):
        raise PipelineError("Raw frame changed; restore it before approving a retry of this target.")
    if target != "video":
        require_video_review(job)
    previous = {key: value for key, value in record.items() if key != "history"}
    history = record.get("history", []) + [previous]
    stable = {key: record[key] for key in ("index", "timestamp", "raw", "raw_sha256", "dimensions", "signature", "model") if key in record}
    record.clear()
    record.update(stable, history=history, state="new", attempt=previous.get("attempt", 1) + 1,
                  retry_approval={"quote": approval, "at": now()})
    job.data["sample_review"] = None
    job.save()
    if target == "video":
        generate_video(job, api)
    else:
        payload = {"image_url": data_uri(job.file(record["raw"])), "seed": job.data["config"]["matte_seed"]}
        run_request(job, record, MATTE_MODEL, payload, "image", api, threading.Event())


def pack(job, playback_ms=None, crop=None, pivot=None):
    Image, _, features = pillow()
    if not features.check("webp"):
        raise PipelineError("Pillow needs animated WebP support.")
    records = job.data["frames"]
    if len(records) != job.data["config"]["frame_count"] or not all(row.get("state") == "completed" for row in records):
        raise PipelineError("Complete all cutouts before packing.")
    require_video_review(job)
    images = []
    for row in records:
        path = job.file(row["output"])
        if not path.is_file() or sha256(path) != row["output_sha256"]:
            raise PipelineError("Cutout missing/changed. Resume its existing request to recover the original result.")
        with Image.open(path) as source:
            images.append(source.convert("RGBA"))
    dimensions = images[0].size
    if any(image.size != dimensions for image in images):
        raise PipelineError("All cutouts must have the same dimensions.")
    config = job.data["config"]
    bounded = config.get("pack_mode") == "full-canvas"
    if bounded:
        if dimensions[0] != dimensions[1]:
            raise PipelineError("Full-canvas export requires square frames.")
        check_safe_bounds(images, config["safe_bounds"], config["alpha_threshold"])
    boxes = [image.getchannel("A").getbbox() for image in images]
    boxes = [box for box in boxes if box]
    if not boxes:
        raise PipelineError("All cutouts are empty; inspect Feyn output before approving any retry.")
    if crop is None:
        if bounded:
            crop = (0, 0, dimensions[0], dimensions[1])
        else:
            crop = (max(0, min(b[0] for b in boxes) - 2), max(0, min(b[1] for b in boxes) - 2),
                    min(dimensions[0], max(b[2] for b in boxes) + 2), min(dimensions[1], max(b[3] for b in boxes) + 2))
    if not (0 <= crop[0] < crop[2] <= dimensions[0] and 0 <= crop[1] < crop[3] <= dimensions[1]):
        raise PipelineError("Crop must be left,top,right,bottom within the source frame.")
    duration = playback_ms if playback_ms is not None else config["playback_ms"]
    if duration < len(images):
        raise PipelineError("Playback duration must be at least 1 ms per frame.")
    size, padding, columns = config["size"], config["padding"], config["columns"]
    scale = min(size / (crop[2] - crop[0]), size / (crop[3] - crop[1]))
    resized = (max(1, round((crop[2] - crop[0]) * scale)), max(1, round((crop[3] - crop[1]) * scale)))
    offset = ((size - resized[0]) // 2, (size - resized[1]) // 2)
    pivot = pivot or (dimensions[0] / 2, dimensions[1] / 2)
    if not all(math.isfinite(value) for value in pivot):
        raise PipelineError("Pivot must be finite source-frame pixel coordinates.")
    # Use actual rounded resize factors, not the ideal scale, for the exported anchor.
    anchor = ((pivot[0] - crop[0]) * resized[0] / (crop[2] - crop[0]) + offset[0],
              (pivot[1] - crop[1]) * resized[1] / (crop[3] - crop[1]) + offset[1])
    signature = {"cutouts": [row["output_sha256"] for row in records], "crop": list(crop), "pivot": list(pivot),
                 "playback_ms": duration, "size": size, "padding": padding, "columns": columns}
    if bounded:
        signature.update(pack_mode=config["pack_mode"], safe_bounds=config["safe_bounds"],
                         alpha_threshold=config["alpha_threshold"])
    digest = hashlib.sha256(json.dumps(signature, sort_keys=True).encode()).hexdigest()[:12]
    out = job.file("exports/" + digest)
    pitch = size + 2 * padding
    rows = math.ceil(len(images) / columns)
    atlas = Image.new("RGBA", (columns * pitch, rows * pitch))
    prepared, frame_meta, paths = [], [], []
    for index, image in enumerate(images):
        canvas = Image.new("RGBA", (size, size))
        canvas.alpha_composite(image.crop(crop).resize(resized, Image.Resampling.LANCZOS), offset)
        if bounded:
            # A manual crop may not discard glow or defeat the exported safe margin.
            alpha_box = image.getchannel("A").getbbox()
            if alpha_box and (alpha_box[0] < crop[0] or alpha_box[1] < crop[1] or
                              alpha_box[2] > crop[2] or alpha_box[3] > crop[3]):
                raise PipelineError(f"Crop clips frame {index}; preserve the full effect and glow.")
            check_safe_bounds([canvas], config["safe_bounds"], config["alpha_threshold"], label=f"export frame {index}")
        x, y = index % columns * pitch + padding, index // columns * pitch + padding
        atlas.paste(canvas, (x, y))
        frame_ms = round((index + 1) * duration / len(images)) - round(index * duration / len(images))
        frame_meta.append({"index": index, "rect": {"x": x, "y": y, "width": size, "height": size}, "durationMs": frame_ms})
        prepared.append(canvas)
        path = out / f"frame-{index:04d}.png"
        paths.append(path)
    # Validate every frame before writing any export files.
    out.mkdir(parents=True, exist_ok=True)
    for canvas, path in zip(prepared, paths):
        canvas.save(path)
    atlas.save(out / "sheet.png")
    prepared[0].save(out / "preview.webp", save_all=True, append_images=prepared[1:], lossless=True,
                     duration=[frame["durationMs"] for frame in frame_meta], loop=1, background=(0, 0, 0, 0))
    contact(paths, out / "contact-dark.png", background=(24, 36, 43), columns=columns)
    contact(paths, out / "contact-light.png", background=(235, 235, 235), columns=columns)
    atomic_json(out / "animation.json", {
        "version": 1, "id": job.data["id"], "image": "sheet.png", "frameCount": len(images),
        "frameSize": {"width": size, "height": size}, "sheetSize": {"width": atlas.width, "height": atlas.height},
        "columns": columns, "rows": rows, "padding": padding, "durationMs": duration, "fps": len(images) * 1000 / duration,
        "pivot": {"x": anchor[0], "y": anchor[1], "units": "frame-pixels"},
        "loop": False, "blendMode": "srcOver", "alphaMode": "straight", "sourceCrop": list(crop), "frames": frame_meta,
    })
    job.data.update(state="ready", latest_export=str(out.relative_to(job.path)))
    job.save()
    return out


def summary(job):
    states = {}
    for row in job.data["frames"]:
        states[row["state"]] = states.get(row["state"], 0) + 1
    return {"id": job.data["id"], "state": job.data["state"], "video_state": job.data["video"].get("state", "new"),
            "frames": states, "failed_frames": [row["index"] for row in job.data["frames"] if row["state"] in BLOCKED],
            "latest_export": job.data.get("latest_export"), "job": str(job.path)}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", help="Project root; otherwise discover from cwd")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("doctor")
    init = commands.add_parser("init")
    init.add_argument("id")
    init.add_argument("--description", required=True)
    init.add_argument("--image")
    init.add_argument("--image-prompt")
    init.add_argument("--video-prompt")
    init.add_argument("--kind", choices=("fire", "lightning", "other"), default="other")
    init.add_argument("--duration", type=int, choices=(1, 2), default=2)
    init.add_argument("--playback-ms", type=int)
    init.add_argument("--frames", type=int, default=24)
    init.add_argument("--size", type=int, default=256)
    init.add_argument("--columns", type=int, default=6)
    init.add_argument("--padding", type=int, default=2)
    for name in ("status", "video", "inspect", "extract", "matte", "review", "retry", "pack"):
        command = commands.add_parser(name)
        command.add_argument("id")
        if name in ("video", "matte", "retry"):
            command.add_argument("--poll-interval", type=float, default=2)
            command.add_argument("--timeout", type=float, default=300)
        if name == "inspect":
            command.add_argument("--video")
        elif name == "extract":
            command.add_argument("--start", type=float, default=0)
            command.add_argument("--end", type=float)
        elif name == "matte":
            command.add_argument("--stage", choices=("sample", "remaining"), default="sample")
            command.add_argument("--concurrency", type=int, default=4)
        elif name == "review":
            command.add_argument("--stage", choices=("video", "sample"), default="sample")
            group = command.add_mutually_exclusive_group(required=True)
            group.add_argument("--pass", dest="passed", action="store_true")
            group.add_argument("--fail", dest="passed", action="store_false")
            command.add_argument("--note", required=True)
        elif name == "retry":
            command.add_argument("--target", required=True)
            command.add_argument("--approval", required=True, help="Quote the actual human approval; never fabricate it")
        elif name == "pack":
            command.add_argument("--playback-ms", type=int)
            command.add_argument("--crop", type=int, nargs=4, metavar=("LEFT", "TOP", "RIGHT", "BOTTOM"))
            command.add_argument("--pivot", type=float, nargs=2, metavar=("X", "Y"))
    args = parser.parse_args(argv)
    try:
        root = project_root(args.root)
        if args.command == "doctor":
            result = doctor(root)
            print(json.dumps(result, indent=2))
            return 0 if result["ready"] else 2
        if args.command == "init":
            job = init_job(root, args.id, args.description, args.image, args.image_prompt, args.video_prompt,
                           args.kind, args.duration, args.playback_ms, args.frames, args.size, args.columns, args.padding)
        else:
            if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", args.id):
                raise PipelineError("Invalid animation ID.")
            job = Job(root / "assets" / "animation-source" / args.id)
            options = {"poll_interval": args.poll_interval, "timeout": args.timeout} if hasattr(args, "timeout") else {}
            if options and (options["poll_interval"] <= 0 or options["timeout"] <= 0):
                raise PipelineError("Poll interval and timeout must be positive.")
            with (contextlib.nullcontext() if args.command == "status" else job.exclusive()):
                if args.command == "video":
                    generate_video(job, **options)
                elif args.command == "inspect":
                    inspect_video(job, args.video)
                elif args.command == "extract":
                    extract(job, args.start, args.end)
                elif args.command == "matte":
                    matte(job, args.stage, args.concurrency, **options)
                elif args.command == "review":
                    if args.stage == "video":
                        review_video(job, args.passed, args.note)
                    else:
                        review_samples(job, args.passed, args.note)
                elif args.command == "retry":
                    retry_approved(job, args.target, args.approval, **options)
                elif args.command == "pack":
                    pack(job, args.playback_ms, args.crop, args.pivot)
        print(json.dumps(summary(job), ensure_ascii=False, indent=2))
        return 0
    except (PipelineError, OSError, ValueError) as exc:
        print(f"Stopped: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
