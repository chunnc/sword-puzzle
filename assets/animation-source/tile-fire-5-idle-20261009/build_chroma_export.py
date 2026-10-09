#!/usr/bin/env python3
"""Rebuild this tile locally from original snapshots; never submit paid requests."""
from collections import deque
import importlib.util
import json
from pathlib import Path
import shutil
import zipfile

from PIL import Image, ImageChops

JOB = Path(__file__).resolve().parent
ROOT = JOB.parents[2]
LOW, HIGH = 20, 100


def remove_exterior_blue(source):
    image = source.convert("RGB")
    width, height = image.size
    dominance = ImageChops.subtract(image.getchannel("B"), ImageChops.lighter(
        image.getchannel("R"), image.getchannel("G")))
    values = dominance.load()
    exterior = bytearray(width * height)
    queue = deque([(x, y) for x in range(width) for y in (0, height - 1)]
                  + [(x, y) for y in range(height) for x in (0, width - 1)])
    while queue:
        x, y = queue.popleft()
        if not (0 <= x < width and 0 <= y < height):
            continue
        index = y * width + x
        if exterior[index] or values[x, y] <= LOW:
            continue
        exterior[index] = 1
        queue.extend(((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)))
    pixels = []
    for index, (red, green, blue) in enumerate(image.getdata()):
        if not exterior[index]:
            pixels.append((red, green, blue, 255))
            continue
        t = min(1, (blue - max(red, green) - LOW) / (HIGH - LOW))
        alpha = round(255 * (1 - t * t * (3 - 2 * t)))
        pixels.append((red, green, min(blue, max(red, green)), alpha) if alpha else (0, 0, 0, 0))
    result = Image.new("RGBA", image.size)
    result.putdata(pixels)
    return result


def main():
    spec = importlib.util.spec_from_file_location("animation_pipeline", ROOT / ".agents/skills/create-game-animation/scripts/animation_pipeline.py")
    pipeline = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(pipeline)
    original = json.loads((JOB / "manifest.json").read_text())
    local = JOB / "local-chroma"
    local.mkdir(exist_ok=True)
    records = []
    for index in range(24):
        raw = JOB / f"frames/{index:04d}.png"
        with Image.open(raw) as source:
            image = remove_exterior_blue(source)
        assert image.size == (544, 544)
        assert image.getchannel("A").crop((102, 102, 442, 442)).getextrema() == (255, 255)
        assert image.getpixel((0, 0))[3] == 0
        assert not any(a > 0 and b > max(r, g) + LOW for r, g, b, a in image.getdata())
        relative = f"cutouts/{index:04d}.png"
        target = local / relative
        target.parent.mkdir(exist_ok=True)
        image.save(target)
        records.append({"index": index, "timestamp": index / 24, "state": "completed",
                        "output": relative, "output_sha256": pipeline.sha256(target),
                        "source_sha256": pipeline.sha256(raw), "dimensions": list(image.size)})
    provenance = {"method": "local-exterior-blue-chroma", "thresholds": [LOW, HIGH],
                  "source_url": (JOB / "source-video.url.txt").read_text().strip(),
                  "source_video_sha256": original["video"]["output_sha256"], "paid_requests": 0}
    pipeline.atomic_json(local / "manifest.json", {
        "version": 1, "id": original["id"], "description": original["description"],
        "kind": "fire", "state": "cutouts_ready", "config": original["config"],
        "frames": records, "video": {"state": "imported"}, "processing": provenance,
    })
    out = pipeline.pack(pipeline.Job(local), playback_ms=1000, crop=(0, 0, 544, 544), pivot=(272, 272), loop=True)
    metadata = json.loads((out / "animation.json").read_text())
    assert metadata["sheetSize"] == {"width": 1560, "height": 1040}
    assert sum(frame["durationMs"] for frame in metadata["frames"]) == 1000
    with Image.open(out / "preview.webp") as preview:
        assert preview.n_frames == 24 and preview.info["loop"] == 0
    for index in range(24):
        with Image.open(out / f"frame-{index:04d}.png") as frame:
            assert frame.getchannel("A").crop((48, 48, 208, 208)).getextrema() == (255, 255)
    pipeline.atomic_json(out / "validation.json", {
        "status": "passed", "frameCount": 24, "frameSize": [256, 256],
        "sheetSize": [1560, 1040], "durationMs": 1000, "loop": True,
        "opaque_interior_all_frames": True, "source_canvas_preserved": True, **provenance,
    })
    with zipfile.ZipFile(out / "snapshots-png.zip", "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for index in range(24):
            archive.write(out / f"frame-{index:04d}.png", f"frame-{index:04d}.png")
    runtime = ROOT / "client/app-assets/ui"
    shutil.copyfile(out / "sheet.png", runtime / "tile_fire_5_idle.png")
    pipeline.atomic_json(runtime / "tile_fire_5_idle.json", {**metadata, "image": "tile_fire_5_idle.png"})
    with Image.open(out / "frame-0000.png") as first:
        first.save(ROOT / "assets/ui-source/runtime/tile-fire-5.png")
        first.save(runtime / "tile_fire_5.webp", "WEBP", lossless=True)
    original.setdefault("feyn_draft_export", original.get("latest_export"))
    original.update(state="ready", latest_export=str(out.relative_to(JOB)), local_processing=provenance)
    pipeline.atomic_json(JOB / "manifest.json", original)
    print(out)


if __name__ == "__main__":
    main()
