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

`init` creates the durable manifest. Save the generated `source.png`,
`image.prompt.txt`, and `video.prompt.txt` directly in the new job folder, or pass
existing files using `--image`, `--image-prompt`, and `--video-prompt`.
Use normal file tools for prompt text rather than unsafe shell interpolation.
Defaults: `--duration 2 --frames 24 --size 256 --columns 6 --padding 2`.
`--duration` accepts only 1 or 2; `--playback-ms` changes game playback separately.

## Video and frame selection

```sh
python3 "$animation_tool" video fire-burst-v1
python3 "$animation_tool" inspect fire-burst-v1
# View video-contact.png, then choose one complete cycle:
python3 "$animation_tool" extract fire-burst-v1 --start 0 --end 2
```

For a user-supplied video, skip `video`:

```sh
python3 "$animation_tool" inspect fire-burst-v1 --video /absolute/path/effect.mp4
python3 "$animation_tool" extract fire-burst-v1 --start 0 --end 1.8
```

Probe the actual duration before choosing `--end`. Provider output may include an
extra final frame; generated videos default to trimming at the requested 1–2 seconds.
Imported videos may be longer. Frame selection is immutable once extracted: changing
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
python3 "$animation_tool" pack fire-burst-v1 --crop 20 10 460 470 --pivot 240 240
```

`--crop` is left/top/right/bottom in original frame pixels; `--pivot` is a single
anchor in those same source coordinates. Default crop is the union of every frame's
nonzero alpha bounds plus 2 source pixels, clipped to the source canvas; default
pivot is the original canvas center. No fal calls occur during packing.

Exports live under `exports/<configuration-hash>/`: `sheet.png`, `animation.json`,
`preview.webp` (plays once), dark/light contact sheets and individual normalized PNGs.
Frame rectangles exclude padding. Metadata provides individual integer frame
durations whose sum equals `durationMs`; average `fps` is informational.

## Credentials and references

`FAL_KEY` in the process environment takes precedence over the project's `.env`.
An empty environment variable deliberately disables the file fallback. Never print
the key, commit it, put it in `EXPO_PUBLIC_*`, or copy it to manifests/prompts.
Uploads are PNG data URIs; API responses/HTTP error bodies are not logged. Artifact
downloads do not receive the authorization header.

- [Grok image-to-video API](https://fal.ai/models/xai/grok-imagine-video/v1.5/lite/image-to-video/api)
- [Grok schema](https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=xai%2Fgrok-imagine-video%2Fv1.5%2Flite%2Fimage-to-video)
- [Feyn background removal API](https://fal.ai/models/fal-ai/feynobg/api)
- [fal durable queue](https://fal.ai/docs/documentation/model-apis/inference/queue)
