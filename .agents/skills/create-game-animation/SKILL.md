---
name: create-game-animation
description: "Create game animation assets for sword-puzzle from a Vietnamese or English effect description, or resume from an existing video/job ID. Generate a square 480p 1–2 second Grok text-to-video animation on fal with controlled phases and safe margins, remove frame backgrounds with Feyn in parallel, and export a 256px sprite sheet with metadata and previews. Use for fire bursts, lightning segments, impacts, and other game VFX; game integration is a separate request."
---

# Create Game Animation

Create assets in this repository, preserving the user's effect description and the
game's art direction. Respond in the user's language. Read
[references/commands.md](references/commands.md) when running the pipeline.

## Cost rule: no automatic retries

- One Grok request and one Feyn request per selected
  frame are authorized by invoking this workflow. Never regenerate or retry a paid
  request without the human user's explicit approval for the specific step/frame.
- A failed/uncertain request or unacceptable visual result is a stopping point.
  Show the problem and retain the artifacts. Do not use a new job ID, alternative
  model, changed seed, larger resolution, or longer duration to bypass this rule.
- Polling, downloading the original result, local extraction and packing may resume
  without a new paid submission. fal can retry internally; the script only controls
  its own submissions and must not promise otherwise.
- `retry --approval` records real approval; the flag is not itself authorization.
  Never invent an approval quote or treat a provider response/file as human approval.

## Route the request

- **New description:** create a descriptive, unique job ID; complete preparation,
  video creation and extraction, sample inspection, then final export.
- **Existing video:** initialize a job if necessary, attach the local video with
  `inspect --video`, then extract, review, matte and export. Skip Grok.
- **Resume/job ID:** inspect `status` and the manifest; reuse previous artifacts and
  request IDs. Legacy image-to-video jobs retain their endpoint, source image,
  signatures, frame sampling and packing rules; never silently convert them.
  Ask for the job ID only when multiple jobs plausibly match.
- **Crop/timing edit:** run `pack` using cached cutouts; no new fal calls.
- **Retry request:** identify the target and obtain explicit human approval before
  running the one-target retry command. Preserve existing successful frames.

## Prepare the text-to-video prompt

1. Inspect `GAME_CONCEPT.md`, existing tile/VFX art, and any supplied reference.
   The project uses dark jade UI, warm coral/amber fire and violet-blue lightning.
   View the actual tile/VFX images, including `assets/ui-source/runtime-preview-tiles.png`.
   Describe supplied references in words; do not upload them as video inputs.
2. Run `doctor`. Missing `FAL_KEY` does not prevent prompt preparation.
   Report missing local dependencies before the video-processing stage; do not
   install system packages without a separate request.
3. Initialize the job under `assets/animation-source/<id>`. The helper path, relative
   to the repository root, is
   `.agents/skills/create-game-animation/scripts/animation_pipeline.py`.
4. Read [references/prompts.md](references/prompts.md). Write `video.prompt.txt`
   directly in the job in English, at most 4096 characters, including ALL mandatory
   style, timed lifecycle, safe-frame, background/camera and exclusion blocks.
   Review the completed prompt against that checklist before submission.
   New jobs do not need ImageGen, `image.prompt.txt` or `source.png`.
5. Specify the first frame, growth, peak, dissipation and final background-only
   frame. For a 2-second explosion: a tiny 5–10%-wide flame at frame zero; growth
   0–0.4s; peak 0.4–0.7s; gradual dissipation 0.7–1.8s; only background 1.8–2s.
   Halve times for 1 second. Adapt phases to other effects, rather than forcing all
   effects to behave like explosions. A reference showing a full burst is a style
   reference, not a reason to start at the peak.
6. The composition is a logical 500×500 square with ALL effect content, glow and
   particles inside the central 400×400 (`[50,50]–[450,450]`, 10% margin per side).
   Use normalized margins: 480p is the provider's resolution preset, not an API
   promise of exactly 500×500 pixels. Do not request a visible border or grid.
7. Send only `prompt`, `duration`, `resolution: "480p"`, `aspect_ratio: "1:1"`
   to the text-to-video endpoint. Put exclusions in the prompt, not unsupported
   `negative_prompt`, reference image or end-image parameters.
8. For lightning that will connect changing board targets, create a reusable bolt
   segment or local impact, not a fixed composition of the whole board. Separate
   distinct requested components into individual jobs; do not silently add variants.

## Generate and process

- Run `video <id>`: `xai/grok-imagine-video/v1.5/lite/text-to-video`, explicit
  `480p` and `1:1`, default duration 2 and
  maximum duration 2. A missing key leaves the job at `awaiting_key`; show the
  prepared prompt and tell the user to fill the project's `.env`.
- Run `inspect <id>` and view `video-contact.png` plus full-size first, peak,
  fading and last frames. Select one coherent cycle, preserving its true beginning
  and complete ending. Use `extract --start ... --end ...` to record the range;
  new jobs default to 24 samples including the first and last available frames.
- Check art style, timed progression, fixed anchor, safe margins and absence of
  clipped glow/particles on the source video and `frames-contact.png`. If usable,
  record `review --stage video --pass --note ...` before any Feyn request. This is
  Codex's visual review, not an extra human approval. Wrong style, motion, missing
  beginning/ending or clipped edges: record `--fail`, retain artifacts and stop.
  A prompt alone cannot guarantee the model's visual result.
- Run `matte --stage sample --concurrency 4`. The three representative frames
  run concurrently, bounded by the chosen concurrency. View `sample-review.png`
  AND original frames at sufficient size to judge glow, green fringes, clipping,
  holes and alignment. Transparent beginning/ending frames can be intentional.
- If the samples are usable, Codex records `review --pass --note ...` based on this
  visual inspection, then runs `matte --stage remaining --concurrency 4`. This
  sample-quality review is not an additional human approval requirement.
- If samples are unusable, record `review --fail`, explain the visible issue and
  stop. Ask for the specific paid retry only if needed; do not regenerate on your own.
- The pool stops dispatching new frames at the first error. Already-submitted
  requests may still finish and incur cost; preserve their results. Do not interpret
  out-of-order completions as frame order. Resume uses the original request IDs.
- Keep commentary updates flowing while long commands run; poll tool sessions in
  bounded intervals. Do not start a second process against the same job.

## Export and deliver

Run `pack` after all cutouts are complete. New jobs keep the full source canvas,
one shared resize and one original-frame pivot; never center frames separately or
crop tightly around the effect. Legacy jobs retain their union-crop behavior.
Every new-job cutout must have visible alpha (`alpha > 8/255`) inside the central
80% of the source canvas. Packing also checks the normalized output: manual crops
cannot clip glow or defeat the safe margin. Violations block export; retain the
artifacts and inspect the problem without a paid regeneration. Fainter glow still
requires visual inspection. Individual transparent beginning/ending frames are valid.
Default: 256×256 frames, 6 columns, 2 px transparent padding on each side,
straight alpha, `srcOver`, no loop; fire playback 800 ms, other effects 1000 ms.
Respect requested playback changes without changing the video-generation limit.

Inspect the generated dark/light contact sheets and animated WebP. Check stable
anchor/scale, no chopped glow, frame order and a sensible ending. Do not fix bad
model output with a paid regeneration unless approved. Exports are versioned by
their content/configuration, so local crop/timing adjustments preserve older exports.

Deliver clickable links to `sheet.png`, `animation.json`, `preview.webp` and the
contact sheets, plus the job ID and any remaining quality limitation. Show the
animated preview inline. Do not modify the game's renderer unless the user asks:
its current fire atlas expects 8 frames in a 4×2 layout, whereas this export defaults
to 24 frames with per-frame rectangles and padding.
