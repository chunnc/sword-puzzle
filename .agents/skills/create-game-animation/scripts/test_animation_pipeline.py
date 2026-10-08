"""Offline tests. No real fal request, key, or paid generation is used."""
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest import mock
from urllib import error

import animation_pipeline as pipeline
from PIL import Image, ImageDraw


def png_bytes(image):
    stream = io.BytesIO()
    image.save(stream, "PNG")
    return stream.getvalue()


class FakeFal:
    """Completes out of order and tracks actual concurrent inference requests."""
    def __init__(self, job, fail_indices=(), pending_once=(), unknown=False, video_bytes=b"fake video"):
        self.job = job
        self.calls = []
        self.results = {}
        self.waits = []
        self.fail_indices = set(fail_indices)
        self.pending_once = set(pending_once)
        self.unknown = unknown
        self.video_bytes = video_bytes
        self.lock = threading.Lock()
        self.live = 0
        self.maximum = 0
        self.completed_order = []

    def submit(self, model, payload):
        with self.lock:
            index = None
            if model == pipeline.MATTE_MODEL:
                contents = base64.b64decode(payload["image_url"].split(",", 1)[1])
                image = Image.open(io.BytesIO(contents)).convert("RGBA")
                index = (image.getpixel((16, 16))[1] - 20) // 5
                # Verify that submit intent is durable before any API invocation.
                disk = json.loads((self.job.path / "manifest.json").read_text())
                assert disk["frames"][index]["state"] == "submitting"
                alpha = Image.new("L", image.size, 0)
                ImageDraw.Draw(alpha).rectangle((8, 8, 31, 31), fill=200)
                image.putalpha(alpha)
                result = {"image": {"url": "data:image/png;base64," + base64.b64encode(png_bytes(image)).decode()}}
            else:
                result = {"video": {"url": "data:video/mp4;base64," + base64.b64encode(self.video_bytes).decode()}}
            self.calls.append((model, payload, index))
            if self.unknown:
                raise pipeline.SubmissionUnknown("Connection lost after POST; outcome unknown.")
            request_id = f"request-{len(self.calls)}"
            self.results[request_id] = (index, result)
            self.live += 1
            self.maximum = max(self.maximum, self.live)
            return {"request_id": request_id, "status_url": "https://queue.fal.run/status/" + request_id,
                    "response_url": "https://queue.fal.run/result/" + request_id}

    def wait(self, record):
        request_id = record["request_id"]
        index, result = self.results[request_id]
        self.waits.append(request_id)
        # An early failure occurs before slower in-flight peers finish.
        time.sleep(.01 if index in self.fail_indices else .025 + (12 - (index or 0)) * .002)
        with self.lock:
            self.live = max(0, self.live - 1)
            if index in self.pending_once:
                self.pending_once.remove(index)
                raise pipeline.PendingRequest("Polling timeout; same ID must be resumed.")
            if index in self.fail_indices:
                raise pipeline.PipelineError("Provider failure; no retry approved.")
            self.completed_order.append(index)
        return result


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="animation-test-")
        self.root = Path(self.temporary.name)
        self.job = pipeline.init_job(self.root, "test-fire", "Offline fire test", kind="fire", frame_count=12, size=48)
        self.job.file("fixture.mp4").write_bytes(b"offline source video")
        self.job.data["video"] = {"state": "imported", "output": "fixture.mp4",
                                  "output_sha256": pipeline.sha256(self.job.file("fixture.mp4"))}
        for index in range(12):
            image = Image.new("RGB", (40, 40), (0, 255, 0))
            ImageDraw.Draw(image).rectangle((8, 8, 31, 31), fill=(200, index * 5 + 20, 70))
            relative = f"frames/{index:04d}.png"
            path = self.job.file(relative)
            path.parent.mkdir(exist_ok=True)
            image.save(path)
            self.job.data["frames"].append({"index": index, "raw": relative, "raw_sha256": pipeline.sha256(path),
                                             "dimensions": [40, 40], "timestamp": index / 12, "state": "new"})
        self.job.save()
        pipeline.review_video(self.job, True, "Offline source has correct style, phases and margins.")

    def tearDown(self):
        self.temporary.cleanup()

    def complete(self, concurrency=4):
        api = FakeFal(self.job)
        pipeline.matte(self.job, "sample", concurrency, api)
        pipeline.review_samples(self.job, True, "Mock samples preserve alpha and alignment.")
        pipeline.matte(self.job, "remaining", concurrency, api)
        return api

    def test_parallel_bounded_out_of_order_and_cached(self):
        api = self.complete()
        self.assertEqual(api.maximum, 4)
        self.assertEqual(len(api.calls), 12)
        self.assertNotEqual(api.completed_order, sorted(api.completed_order))
        self.assertEqual([row["index"] for row in self.job.data["frames"]], list(range(12)))
        pipeline.matte(self.job, "remaining", 4, api)
        self.assertEqual(len(api.calls), 12)
        self.assertTrue(self.job.file("sample-review.png").is_file())

    def test_serial_limit(self):
        api = self.complete(concurrency=1)
        self.assertEqual(api.maximum, 1)

    def test_sample_gate_requires_visual_review(self):
        api = FakeFal(self.job)
        with self.assertRaises(pipeline.PipelineError):
            pipeline.matte(self.job, "remaining", 4, api)
        self.assertEqual(api.calls, [])
        pipeline.matte(self.job, "sample", 4, api)
        self.assertEqual(len(api.calls), 3)
        pipeline.review_samples(self.job, False, "Glow lost.")
        with self.assertRaises(pipeline.PipelineError):
            pipeline.matte(self.job, "remaining", 4, api)
        self.assertEqual(len(api.calls), 3)

    def test_failure_stops_new_dispatch_and_saves_peers(self):
        api = FakeFal(self.job)
        pipeline.matte(self.job, "sample", 4, api)
        pipeline.review_samples(self.job, True, "Samples okay.")
        api.fail_indices.add(0)
        with self.assertRaises(pipeline.PipelineError):
            pipeline.matte(self.job, "remaining", 4, api)
        self.assertLessEqual(len(api.calls), 7)  # 3 samples + at most 4 active slots
        states = [row["state"] for row in self.job.data["frames"]]
        self.assertIn("new", states)
        self.assertEqual(states[0], "failed")
        self.assertGreater(states.count("completed"), 3)
        before = len(api.calls)
        with self.assertRaises(pipeline.PipelineError):
            pipeline.matte(self.job, "remaining", 4, api)
        self.assertEqual(len(api.calls), before)

    def test_unknown_submit_is_durable_and_not_repeated(self):
        api = FakeFal(self.job, unknown=True)
        with self.assertRaises(pipeline.PipelineError):
            pipeline.matte(self.job, "sample", 1, api)
        index = pipeline.sample_indices(self.job)[0]
        self.assertEqual(self.job.data["frames"][index]["state"], "unknown")
        reloaded = pipeline.Job(self.job.path)
        with self.assertRaises(pipeline.PipelineError):
            pipeline.matte(reloaded, "sample", 4, api)
        self.assertEqual(len(api.calls), 1)

    def test_crash_before_saved_id_never_resubmits(self):
        index = pipeline.sample_indices(self.job)[0]
        self.job.data["frames"][index]["state"] = "submitting"
        self.job.save()
        api = FakeFal(self.job)
        with self.assertRaises(pipeline.PipelineError):
            pipeline.matte(pipeline.Job(self.job.path), "sample", 4, api)
        self.assertEqual(api.calls, [])

    def test_timeout_resume_uses_original_id(self):
        index = pipeline.sample_indices(self.job)[0]
        api = FakeFal(self.job, pending_once={index})
        with self.assertRaises(pipeline.PipelineError):
            pipeline.matte(self.job, "sample", 1, api)
        row = self.job.data["frames"][index]
        request_id = row["request_id"]
        self.assertEqual(row["state"], "pending")
        pipeline.matte(pipeline.Job(self.job.path), "sample", 4, api)
        self.assertEqual(api.waits.count(request_id), 2)
        self.assertEqual(len(api.calls), 3)

    def test_resume_failure_barrier_prevents_new_posts(self):
        index = pipeline.sample_indices(self.job)[0]
        api = FakeFal(self.job, pending_once={index})
        with self.assertRaises(pipeline.PipelineError):
            pipeline.matte(self.job, "sample", 1, api)
        api.pending_once.add(index)
        with self.assertRaises(pipeline.PipelineError):
            pipeline.matte(self.job, "sample", 4, api)
        self.assertEqual(len(api.calls), 1)

    def test_approved_retry_is_one_target_and_keeps_history(self):
        api = FakeFal(self.job, unknown=True)
        with self.assertRaises(pipeline.PipelineError):
            pipeline.matte(self.job, "sample", 1, api)
        index = pipeline.sample_indices(self.job)[0]
        with self.assertRaises(pipeline.PipelineError):
            pipeline.retry_approved(self.job, f"frame:{index}", "", api)
        api.unknown = False
        pipeline.retry_approved(self.job, f"frame:{index}", "Human approved this one retry in the test.", api)
        row = self.job.data["frames"][index]
        self.assertEqual(len(api.calls), 2)
        self.assertEqual(row["state"], "completed")
        self.assertEqual(row["attempt"], 2)
        self.assertEqual(row["history"][0]["state"], "unknown")
        self.assertIsNone(self.job.data["sample_review"])

    def test_retry_does_not_duplicate_pending_request(self):
        index = pipeline.sample_indices(self.job)[0]
        api = FakeFal(self.job, pending_once={index})
        with self.assertRaises(pipeline.PipelineError):
            pipeline.matte(self.job, "sample", 1, api)
        with self.assertRaises(pipeline.PipelineError):
            pipeline.retry_approved(self.job, f"frame:{index}", "Approved", api)
        self.assertEqual(len(api.calls), 1)

    def test_missing_cutout_download_uses_old_request(self):
        api = self.complete()
        row = self.job.data["frames"][3]
        self.job.file(row["output"]).unlink()
        pipeline.matte(self.job, "sample", 4, api)
        self.assertEqual(len(api.calls), 12)
        self.assertTrue(self.job.file(row["output"]).is_file())

    def test_changed_raw_frame_does_not_get_billed(self):
        api = FakeFal(self.job)
        self.job.file(self.job.data["frames"][3]["raw"]).write_bytes(b"changed")
        with self.assertRaises(pipeline.PipelineError):
            pipeline.matte(self.job, "sample", 4, api)
        self.assertEqual(api.calls, [])

    def test_disk_error_resumes_original_result_without_new_post(self):
        api = FakeFal(self.job)
        original = pipeline.atomic_bytes
        def disk_full(path, data):
            if "cutouts" in str(path):
                raise OSError("disk full")
            return original(path, data)
        with mock.patch.object(pipeline, "atomic_bytes", side_effect=disk_full):
            with self.assertRaises(pipeline.PipelineError):
                pipeline.matte(self.job, "sample", 1, api)
        index = pipeline.sample_indices(self.job)[0]
        self.assertEqual(self.job.data["frames"][index]["state"], "pending")
        request_id = self.job.data["frames"][index]["request_id"]
        pipeline.matte(self.job, "sample", 4, api)
        self.assertEqual(api.waits.count(request_id), 2)
        self.assertEqual(len(api.calls), 3)

    def test_pack_rectangles_alpha_timing_anchor_and_local_revision(self):
        api = self.complete()
        with mock.patch.object(pipeline, "require_api", side_effect=AssertionError("Packing must not touch fal")):
            out = pipeline.pack(self.job)
            revised = pipeline.pack(self.job, playback_ms=600)
        self.assertNotEqual(out, revised)
        metadata = json.loads((out / "animation.json").read_text())
        self.assertEqual(sum(frame["durationMs"] for frame in metadata["frames"]), 800)
        self.assertEqual(metadata["frameCount"], 12)
        self.assertFalse(metadata["loop"])
        self.assertEqual(metadata["pivot"], {"x": 24.0, "y": 24.0, "units": "frame-pixels"})
        with Image.open(out / "sheet.png") as atlas:
            self.assertEqual(atlas.size, (6 * 52, 2 * 52))
            self.assertEqual(atlas.getpixel((0, 0))[3], 0)
            for index, frame in enumerate(metadata["frames"]):
                rect = frame["rect"]
                actual = atlas.getpixel((rect["x"] + 24, rect["y"] + 24))
                # RGBA resampling uses premultiplied arithmetic and can round by 1.
                for channel, expected in zip(actual[:3], (200, index * 5 + 20, 70)):
                    self.assertAlmostEqual(channel, expected, delta=1)
                self.assertEqual(actual[3], 200)
        with Image.open(out / "preview.webp") as preview:
            self.assertEqual(preview.n_frames, 12)
            self.assertEqual(preview.info["loop"], 1)
        self.assertEqual(len(api.calls), 12)

    def test_shared_crop_keeps_motion_and_fixed_pivot(self):
        self.make_legacy(self.job)
        self.complete()
        for index, row in enumerate(self.job.data["frames"]):
            image = Image.new("RGBA", (40, 40))
            ImageDraw.Draw(image).rectangle((index + 2, 10, index + 5, 13), fill=(255, 100, 30, 220))
            image.save(self.job.file(row["output"]))
            row["output_sha256"] = pipeline.sha256(self.job.file(row["output"]))
        out = pipeline.pack(self.job)
        bounds = []
        for index in range(12):
            with Image.open(out / f"frame-{index:04d}.png") as image:
                bounds.append(image.getchannel("A").getbbox())
        self.assertLess(bounds[0][0], bounds[-1][0])

    def test_process_lock_and_atomic_manifest(self):
        with self.job.exclusive():
            with self.assertRaises(pipeline.PipelineError):
                with pipeline.Job(self.job.path).exclusive():
                    pass
        self.assertEqual(pipeline.Job(self.job.path).data["id"], "test-fire")
        self.assertFalse((self.job.path / "manifest.json.tmp").exists())

    def test_missing_key_does_not_submit(self):
        with mock.patch.dict(os.environ, {"FAL_KEY": ""}):
            with self.assertRaises(pipeline.MissingKey):
                pipeline.matte(self.job, "sample")
        self.assertEqual(self.job.data["state"], "awaiting_key")
        self.assertTrue(all(row["state"] == "new" for row in self.job.data["frames"]))

    def test_env_precedence_and_no_shell_execution(self):
        (self.root / ".env").write_text("FAL_KEY='$(do-not-run)'\n")
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertEqual(pipeline.load_key(self.root), "$(do-not-run)")
        with mock.patch.dict(os.environ, {"FAL_KEY": "override"}):
            self.assertEqual(pipeline.load_key(self.root), "override")
        with mock.patch.dict(os.environ, {"FAL_KEY": ""}):
            self.assertEqual(pipeline.load_key(self.root), "")

    def test_video_explicit_limits_cached_and_missing_key(self):
        job = pipeline.init_job(self.root, "video-test", "Video test", duration=1)
        job.file("video.prompt.txt").write_text("Expand once and dissipate. Fixed camera and background.")
        with mock.patch.dict(os.environ, {"FAL_KEY": ""}):
            with self.assertRaises(pipeline.MissingKey):
                pipeline.generate_video(job)
        api = FakeFal(job)
        pipeline.generate_video(job, api)
        pipeline.generate_video(job, api)
        self.assertEqual(len(api.calls), 1)
        self.assertEqual(api.calls[0][0], pipeline.VIDEO_MODEL)
        self.assertEqual(api.calls[0][1]["resolution"], "480p")
        self.assertEqual(api.calls[0][1]["duration"], 1)
        self.assertEqual(api.calls[0][1]["aspect_ratio"], "1:1")
        self.assertNotIn("image_url", api.calls[0][1])
        self.assertFalse(job.file("source.png").exists())
        self.assertEqual(job.data["config"]["generation_mode"], "text-to-video")
        job.file("video.prompt.txt").write_text("Changed prompt cannot silently replace the cached request.")
        with self.assertRaises(pipeline.PipelineError):
            pipeline.generate_video(job, api)
        self.assertEqual(len(api.calls), 1)
        with self.assertRaises(pipeline.PipelineError):
            pipeline.init_job(self.root, "too-long", "Invalid", duration=3)

    def make_legacy(self, job):
        job.data["version"] = 1
        job.data["config"]["video_model"] = pipeline.LEGACY_VIDEO_MODEL
        for key in ("generation_mode", "aspect_ratio", "safe_bounds", "alpha_threshold", "pack_mode", "frame_sampling"):
            job.data["config"].pop(key, None)
        job.data.pop("video_review", None)
        job.save()

    def legacy_video(self, slug):
        job = pipeline.init_job(self.root, slug, "Legacy video")
        self.make_legacy(job)
        Image.new("RGB", (40, 40), (255, 100, 30)).save(job.file("source.png"))
        job.file("video.prompt.txt").write_text("Legacy image expands once and dissipates.")
        return job

    def test_legacy_resume_keeps_endpoint_signature_and_original_request(self):
        job = self.legacy_video("legacy-pending")
        api = FakeFal(job, pending_once={None})
        with self.assertRaises(pipeline.PendingRequest):
            pipeline.generate_video(job, api)
        model, payload, _ = api.calls[0]
        self.assertEqual(model, pipeline.LEGACY_VIDEO_MODEL)
        self.assertIn("image_url", payload)
        self.assertNotIn("aspect_ratio", payload)
        expected = {"image_url": pipeline.data_uri(job.file("source.png")),
                    "prompt": job.file("video.prompt.txt").read_text().strip(),
                    "resolution": "480p", "duration": 2}
        signature = hashlib.sha256(json.dumps(expected, sort_keys=True).encode()).hexdigest()
        self.assertEqual(job.data["video"]["signature"], signature)
        request_id = job.data["video"]["request_id"]
        reloaded = pipeline.Job(job.path)
        pipeline.generate_video(reloaded, api)
        self.assertEqual(len(api.calls), 1)
        self.assertEqual(api.waits, [request_id, request_id])
        self.assertEqual(reloaded.data["video"]["signature"], signature)
        self.assertEqual(reloaded.data["version"], 1)

    def test_legacy_retry_keeps_endpoint_history_and_source(self):
        job = self.legacy_video("legacy-retry")
        api = FakeFal(job, unknown=True)
        with self.assertRaises(pipeline.SubmissionUnknown):
            pipeline.generate_video(job, api)
        signature = job.data["video"]["signature"]
        api.unknown = False
        pipeline.retry_approved(pipeline.Job(job.path), "video", "Human approves this one offline retry.", api)
        record = pipeline.Job(job.path).data["video"]
        self.assertEqual(len(api.calls), 2)
        self.assertTrue(all(call[0] == pipeline.LEGACY_VIDEO_MODEL for call in api.calls))
        self.assertEqual(api.calls[0][1], api.calls[1][1])
        self.assertEqual(record["signature"], signature)
        self.assertEqual(record["history"][0]["state"], "unknown")
        self.assertEqual(record["attempt"], 2)

    def test_changed_endpoint_cannot_resume_as_another_model(self):
        job = self.legacy_video("legacy-model-change")
        api = FakeFal(job)
        pipeline.generate_video(job, api)
        job.data["config"]["video_model"] = pipeline.VIDEO_MODEL
        with self.assertRaisesRegex(pipeline.PipelineError, "endpoint changed"):
            pipeline.generate_video(job, api)
        self.assertEqual(len(api.calls), 1)

    def test_video_review_gates_feyn_and_detects_source_changes(self):
        api = FakeFal(self.job)
        self.job.data["video_review"] = None
        with self.assertRaises(pipeline.PipelineError):
            pipeline.matte(self.job, "sample", api=api)
        pipeline.review_video(self.job, False, "Starts at peak; unacceptable.")
        with self.assertRaises(pipeline.PipelineError):
            pipeline.matte(self.job, "sample", api=api)
        pipeline.review_video(self.job, True, "Offline source reviewed.")
        self.job.file("fixture.mp4").write_bytes(b"changed video")
        self.job.data["video"]["output_sha256"] = pipeline.sha256(self.job.file("fixture.mp4"))
        with self.assertRaises(pipeline.PipelineError):
            pipeline.matte(self.job, "sample", api=api)
        self.assertEqual(api.calls, [])

    def test_full_canvas_export_preserves_margins_size_and_anchor(self):
        self.complete()
        self.job.data["config"]["size"] = 256
        out = pipeline.pack(self.job)
        metadata = json.loads((out / "animation.json").read_text())
        self.assertEqual(metadata["sourceCrop"], [0, 0, 40, 40])
        self.assertEqual(metadata["frameSize"], {"width": 256, "height": 256})
        self.assertEqual(metadata["pivot"], {"x": 128.0, "y": 128.0, "units": "frame-pixels"})
        with Image.open(out / "frame-0000.png") as image:
            self.assertEqual(image.size, (256, 256))
            box = image.getchannel("A").point(lambda alpha: 255 if alpha > 8 else 0).getbbox()
            self.assertGreaterEqual(box[0], 26)
            self.assertLessEqual(box[2], 230)

    def test_alpha_threshold_and_empty_frame_bounds(self):
        image = Image.new("RGBA", (500, 500))
        pipeline.check_safe_bounds([image], [0.1, 0.1, 0.9, 0.9], 8)
        image.putpixel((0, 0), (255, 100, 30, 8))
        pipeline.check_safe_bounds([image], [0.1, 0.1, 0.9, 0.9], 8)
        image.putpixel((0, 0), (255, 100, 30, 9))
        with self.assertRaisesRegex(pipeline.PipelineError, "central 80%"):
            pipeline.check_safe_bounds([image], [0.1, 0.1, 0.9, 0.9], 8)
        image.putpixel((0, 0), (0, 0, 0, 0))
        ImageDraw.Draw(image).rectangle((50, 50, 449, 449), fill=(255, 100, 30, 255))
        pipeline.check_safe_bounds([image], [0.1, 0.1, 0.9, 0.9], 8)
        image.putpixel((450, 449), (255, 100, 30, 9))
        with self.assertRaises(pipeline.PipelineError):
            pipeline.check_safe_bounds([image], [0.1, 0.1, 0.9, 0.9], 8)

    def test_any_out_of_bounds_frame_blocks_export_without_requests(self):
        api = self.complete()
        row = self.job.data["frames"][0]  # Outside the three reviewed samples.
        with Image.open(self.job.file(row["output"])) as source:
            image = source.convert("RGBA")
        image.putpixel((1, 20), (255, 100, 30, 9))
        image.save(self.job.file(row["output"]))
        row["output_sha256"] = pipeline.sha256(self.job.file(row["output"]))
        with self.assertRaisesRegex(pipeline.PipelineError, "Frame 0"):
            pipeline.pack(self.job)
        self.assertFalse(self.job.file("exports").exists())
        self.assertEqual(len(api.calls), 12)

    def test_sample_bounds_block_passing_review(self):
        api = FakeFal(self.job)
        pipeline.matte(self.job, "sample", api=api)
        row = self.job.data["frames"][pipeline.sample_indices(self.job)[0]]
        with Image.open(self.job.file(row["output"])) as source:
            image = source.convert("RGBA")
        image.putpixel((0, 20), (255, 100, 30, 200))
        image.save(self.job.file(row["output"]))
        row["output_sha256"] = pipeline.sha256(self.job.file(row["output"]))
        with self.assertRaises(pipeline.PipelineError):
            pipeline.review_samples(self.job, True, "Cannot override bounds.")
        with self.assertRaises(pipeline.PipelineError):
            pipeline.matte(self.job, "remaining", api=api)
        self.assertEqual(len(api.calls), 3)

    def test_custom_crop_cannot_remove_margins_or_clip_faint_glow(self):
        self.complete()
        with self.assertRaisesRegex(pipeline.PipelineError, "export frame"):
            pipeline.pack(self.job, crop=(8, 8, 32, 32))
        self.assertFalse(self.job.file("exports").exists())
        row = self.job.data["frames"][-1]
        with Image.open(self.job.file(row["output"])) as source:
            image = source.convert("RGBA")
        image.putpixel((1, 20), (255, 100, 30, 8))
        image.save(self.job.file(row["output"]))
        row["output_sha256"] = pipeline.sha256(self.job.file(row["output"]))
        with self.assertRaisesRegex(pipeline.PipelineError, "Crop clips frame 11"):
            pipeline.pack(self.job, crop=(2, 0, 40, 40))
        self.assertFalse(self.job.file("exports").exists())

    def test_legacy_pack_keeps_union_crop_without_new_review_gate(self):
        self.make_legacy(self.job)
        self.complete()
        out = pipeline.pack(self.job)
        metadata = json.loads((out / "animation.json").read_text())
        self.assertEqual(metadata["sourceCrop"], [6, 6, 34, 34])

    def test_new_extraction_includes_first_and_last_frames_legacy_unchanged(self):
        info = {"duration": 2.0, "fps": 24.0, "width": 40, "height": 40}
        def capture_fixture(video, timestamp, output):
            output.parent.mkdir(parents=True, exist_ok=True)
            Image.new("RGB", (40, 40), (0, 255, 0)).save(output)
        for legacy in (False, True):
            job = pipeline.init_job(self.root, "sampling-" + str(legacy).lower(), "Sampling")
            if legacy:
                self.make_legacy(job)
            pipeline.attach_video(job, self.job.file("fixture.mp4"))
            with mock.patch.object(pipeline, "probe", return_value=info), mock.patch.object(pipeline, "capture", side_effect=capture_fixture):
                pipeline.extract(job)
                before = job.data["frames"][-1]["timestamp"]
                pipeline.extract(pipeline.Job(job.path))
            self.assertEqual(job.data["frames"][0]["timestamp"], 0)
            self.assertAlmostEqual(before, 23 / 24 * 2 if legacy else 2 - 1 / 24)
            self.assertEqual(len(job.data["frames"]), 24)

    def test_nonsquare_source_is_rejected_before_extraction(self):
        self.job.data["frames"] = []
        with mock.patch.object(pipeline, "probe", return_value={"width": 100, "height": 80}):
            with self.assertRaisesRegex(pipeline.PipelineError, "square video"):
                pipeline.extract(self.job)

    def test_http_transport_never_retries_post_or_leaks_key(self):
        api = pipeline.FalAPI("test-secret-key", timeout=.1)
        for exception in (error.URLError("offline"), error.HTTPError("https://queue.fal.run/test", 429, "rate limited", {}, None)):
            with mock.patch.object(api.opener, "open", side_effect=exception) as opened:
                with self.assertRaises(pipeline.PipelineError) as raised:
                    api.submit(pipeline.MATTE_MODEL, {"image_url": "data:image/png;base64,AA=="})
                self.assertEqual(opened.call_count, 1)
                self.assertNotIn("test-secret-key", str(raised.exception))
        with self.assertRaises(pipeline.PipelineError):
            api.json_request("https://example.com/steal-key")

    def test_get_rate_limit_keeps_pending(self):
        api = pipeline.FalAPI("test-secret-key")
        with mock.patch.object(api.opener, "open", side_effect=error.HTTPError("https://queue.fal.run/test", 429, "limit", {}, None)):
            with self.assertRaises(pipeline.PendingRequest):
                api.json_request("https://queue.fal.run/test")


class RealVideoTests(unittest.TestCase):
    @unittest.skipUnless(os.environ.get("FFMPEG_BIN") and os.environ.get("FFPROBE_BIN"), "Set FFmpeg/ffprobe paths for real video tests")
    def test_real_video_probe_extract_and_immutable_selection(self):
        with tempfile.TemporaryDirectory(prefix="animation-video-test-") as directory:
            root = Path(directory)
            video = root / "fixture.mp4"
            pipeline.media_command([pipeline.binary("ffmpeg"), "-hide_banner", "-loglevel", "error", "-y",
                                    "-f", "lavfi", "-i", "color=c=green:s=96x96:r=24:d=2", "-vf",
                                    "drawbox=x=24:y=24:w=48:h=48:color=orange:t=fill", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(video)])
            job = pipeline.init_job(root, "real-video", "Real video", frame_count=6)
            info = pipeline.inspect_video(job, video)
            self.assertAlmostEqual(info["duration"], 2, delta=.1)
            self.assertTrue(job.file("video-contact.png").is_file())
            pipeline.extract(job, 0, 1.8)
            self.assertEqual(len(job.data["frames"]), 6)
            for row in job.data["frames"]:
                with Image.open(job.file(row["raw"])) as image:
                    self.assertEqual(image.size, (96, 96))
            pipeline.extract(pipeline.Job(job.path), 0, 1.8)
            with self.assertRaises(pipeline.PipelineError):
                pipeline.extract(job, 0, 1)


if __name__ == "__main__":
    unittest.main()
