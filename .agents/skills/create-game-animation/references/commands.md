# Pipeline commands

Run from the repository root with Python 3.9+ and Pillow with animated WebP support.
The script uses FFmpeg/ffprobe and Python's standard HTTP client; no fal SDK or app
dependency is added. `FFMPEG_BIN` and `FFPROBE_BIN` may point to existing executables.
`doctor` explains missing tools. On macOS FFmpeg can be installed with
`brew install ffmpeg`; install packages only when the user requests it.

Use a shell variable for readability:

```sh
animation_tool=.agents/skills/create-game-animation/scripts/animation_pipeline.py
python3 "$animation_tool" doctor
python3 "$animation_tool" init fire-burst-v1 --description 'Vụ nổ lửa san hô, lõi sáng ngà' --kind fire
```

`init` creates a version-2 text-to-video manifest. Save `video.prompt.txt` directly
in the new job folder, or pass it using `--video-prompt`. Include all required
blocks from [prompts.md](prompts.md). No generated source image is needed.
`--image` and `--image-prompt` remain accepted for archival/reference files only;
they do not switch a new job to image-to-video and are not sent to Grok.
Use normal file tools for prompt text rather than unsafe shell interpolation.
Defaults: `--duration 2 --frames 24 --size 256 --columns 6 --padding 2`.
`--duration` accepts only 1 or 2; `--playback-ms` changes game playback separately.

## Video and frame selection

```sh
python3 "$animation_tool" video fire-burst-v1
python3 "$animation_tool" inspect fire-burst-v1
# View video-contact.png, then choose one complete cycle:
python3 "$animation_tool" extract fire-burst-v1 --start 0 --end 2
# Inspect the source video and full-size first/peak/fade/last extracted frames:
python3 "$animation_tool" review fire-burst-v1 --stage video --pass --note 'Tiny initial flame, one peak, complete fade; correct 2D style and clear margins.'
```

For a user-supplied video, skip `video`:

```sh
python3 "$animation_tool" inspect fire-burst-v1 --video /absolute/path/effect.mp4
python3 "$animation_tool" extract fire-burst-v1 --start 0 --end 1.8
# Inspect source and extracted frames, then record review --stage video as above.
```

Probe the actual duration before choosing `--end`. Provider output may include an
extra final frame; generated videos default to trimming at the requested 1–2 seconds.
Imported videos may be longer; new jobs still require a square canvas and safe
margins. New jobs sample both the start and last available frame within the range;
legacy jobs preserve their original sampling. Frame selection is immutable once extracted: changing
source/selection requires an explicitly requested revision, whereas playback timing
and crop can always be repacked locally.

## Matting and visual review

```sh
python3 "$animation_tool" matte fire-burst-v1 --stage sample --concurrency 4
# View sample-review.png: original, dark background, light background.
python3 "$animation_tool" review fire-burst-v1 --pass --note 'Glow and silhouettes preserved; no green edge or drift.'
python3 "$animation_tool" matte fire-burst-v1 --stage remaining --concurrency 4
python3 "$animation_tool" pack fire-burst-v1
python3 "$animation_tool" status fire-burst-v1
```

Concurrency bounds the number of live requests, not just the POST calls. The sample
uses three quarter/middle/three-quarter frames; cached sample results count toward
the final 24 and are not billed again. `review --fail --note ...` blocks the remaining
batch. A changed sample output invalidates its previous review.
New jobs also require a passing `review --stage video` before Feyn, bound to the
source video, selection and raw frame hashes. `review --stage video --fail --note ...`
blocks matting and export. Use it when style, progression, ending or framing is
wrong; retain artifacts. Review is performed by Codex, not a new user approval.
The default `review` stage remains `sample` for compatibility. A passing sample
review additionally checks visible alpha bounds before the remaining batch.

API commands accept `--timeout 300 --poll-interval 2`. A timeout retains request IDs;
re-running the same command polls/downloads existing requests rather than resubmitting.
A saved `submitting` record with no ID is deliberately blocked because the previous
process could have crashed just after fal accepted the POST.

## Explicitly approved retry only

Only after the human approves that target:

```sh
python3 "$animation_tool" retry fire-burst-v1 --target frame:7 --approval 'Actual human approval for retrying frame 7'
# Or --target video when no frames have been extracted yet.
```

This submits ONE new attempt for ONE target and retains its attempt history.
The quote must come from the human conversation. A CLI flag or a file is not proof
of authorization. Do not retry pending requests: resume polling them instead.
No automatic POST retries, backoff resubmissions, fallback models or increased
resolution/duration are performed. Provider-side internal retries are outside this
client's control. After a retry, inspect the samples and record their review again.

## Local-only revisions

```sh
python3 "$animation_tool" pack fire-burst-v1 --playback-ms 800
# Legacy jobs can retain their original crop workflow:
python3 "$animation_tool" pack legacy-fire-job --crop 20 10 460 470 --pivot 240 240
```

`--crop` is left/top/right/bottom in original frame pixels; `--pivot` is a single
anchor in those same source coordinates. New jobs default to the full source
canvas, resized once with a shared transform to 256×256, keeping the center and
10% margins. Every cutout's visible alpha (`>8/255`) must lie in the central 80%
of the source; the exported frames must also pass. Fully transparent individual
frames are allowed. Fainter glow and clipping need visual review as well.
Custom crops cannot discard any nonzero alpha or remove the exported safe margin;
invalid crops/bounds block export without paid retries. Legacy jobs default to the
union of nonzero alpha bounds plus 2 source pixels, clipped to the source canvas.
Default pivot is the original canvas center. No fal calls occur during packing.

New manifests store `generation_mode`, `video_model`, `aspect_ratio`, normalized
`safe_bounds`, `alpha_threshold`, `pack_mode` and `frame_sampling`. Existing version-1
manifests are not migrated: generation/resume/retry use the saved image-to-video
endpoint and original image/prompt signature; extraction and packing keep their
old rules. Do not edit an existing job to change models or bypass retry approval.

Exports live under `exports/<configuration-hash>/`: `sheet.png`, `animation.json`,
`preview.webp` (plays once), dark/light contact sheets and individual normalized PNGs.
Frame rectangles exclude padding. Metadata provides individual integer frame
durations whose sum equals `durationMs`; average `fps` is informational.

## Credentials and references

`FAL_KEY` in the process environment takes precedence over the project's `.env`.
An empty environment variable deliberately disables the file fallback. Never print
the key, commit it, put it in `EXPO_PUBLIC_*`, or copy it to manifests/prompts.
Feyn uploads (and legacy video images) are PNG data URIs; text-to-video sends no
image. API responses/HTTP error bodies are not logged. Artifact
downloads do not receive the authorization header.

- [Grok text-to-video API](https://fal.ai/models/xai/grok-imagine-video/v1.5/lite/text-to-video/api)
- [Grok schema](https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=xai%2Fgrok-imagine-video%2Fv1.5%2Flite%2Ftext-to-video)
- [Legacy image-to-video API](https://fal.ai/models/xai/grok-imagine-video/v1.5/lite/image-to-video/api)
- [Feyn background removal API](https://fal.ai/models/fal-ai/feynobg/api)
- [fal durable queue](https://fal.ai/docs/documentation/model-apis/inference/queue)
