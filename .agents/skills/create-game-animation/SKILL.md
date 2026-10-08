---
name: create-game-animation
description: "Create game animation assets for sword-puzzle from a Vietnamese or English effect description, or resume from an existing video/job ID. Generate an image and video prompt, create a 480p 1–2 second Grok video on fal, remove frame backgrounds with Feyn in parallel, and export a sprite sheet with metadata and previews. Use for fire bursts, lightning segments, impacts, and other game VFX; game integration is a separate request."
---

# Create Game Animation

Create assets in this repository, preserving the user's effect description and the
game's art direction. Respond in the user's language. Read
[references/commands.md](references/commands.md) when running the pipeline.

## Cost rule: no automatic retries

- The initial image generation, one Grok request, and one Feyn request per selected
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
  `inspect --video`, then extract, matte and export. Skip ImageGen and Grok.
- **Resume/job ID:** inspect `status` and the manifest; reuse previous artifacts and
  request IDs. Ask for the job ID only when multiple jobs plausibly match.
- **Crop/timing edit:** run `pack` using cached cutouts; no new fal calls.
- **Retry request:** identify the target and obtain explicit human approval before
  running the one-target retry command. Preserve existing successful frames.

## Prepare the image and video prompt

1. Inspect `GAME_CONCEPT.md`, existing tile/VFX art, and any supplied reference.
   The project uses dark jade UI, warm coral/amber fire and violet-blue lightning.
   Prefer compact, readable game VFX over a cinematic scene.
2. Run `doctor`. Missing `FAL_KEY` does not prevent image/prompt preparation.
   Report missing local dependencies before the video-processing stage; do not
   install system packages without a separate request.
3. Initialize the job under `assets/animation-source/<id>`. The helper path, relative
   to the repository root, is
   `.agents/skills/create-game-animation/scripts/animation_pipeline.py`.
4. Write `image.prompt.txt` and use the available built-in ImageGen tool, following
   its tool instructions, for ONE initial square image. Preserve the reference
   identity/style when a reference is provided. Use a flat saturated green chroma
   background, no ground, text, camera perspective changes or secondary objects.
   If the effect itself contains green, choose a contrasting flat chroma color.
   Keep the effect centered and leave room for expansion and glow at every edge.
5. The image must show enough of the actual effect to guide the video. For an
   explosion use an early, recognizable burst with a bright core, flame shapes and
   material detail, rather than an empty frame or an indistinct dot. Do not promise
   a true empty-to-explosion sequence from this one-image endpoint.
6. Display the generated image. Copy the selected image into the job as `source.png`
   (convert to RGB PNG if necessary); never leave a project source only in the
   default ImageGen output directory.
7. Write `video.prompt.txt` in English, at most 4096 characters: animate only the
   supplied effect; grow/burst, reach a readable peak, dissipate completely once;
   finish within 2 seconds (1 if requested); no loop, camera movement, zoom, cuts,
   background changes, floor, characters, text, new objects or clipped edges.
   Model constraints belong in the prompt; do not send unsupported API parameters
   such as `negative_prompt`, `aspect_ratio`, or a separate reference/end image.
8. For lightning that will connect changing board targets, create a reusable bolt
   segment or local impact, not a fixed composition of the whole board. Separate
   distinct requested components into individual jobs; do not silently add variants.

## Generate and process

- Run `video <id>`: exact Grok endpoint, explicit `480p`, default duration 2 and
  maximum duration 2. A missing key leaves the job at `awaiting_key`; show the
  prepared image/prompt and tell the user to fill the project's `.env`.
- Run `inspect <id>` and view `video-contact.png`; select one coherent cycle.
  Use `extract --start ... --end ...` to record the chosen range. Default 24 frames.
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

Run `pack` after all cutouts are complete. It uses one union crop, one resize and
one original-frame pivot for the entire sequence; never center each frame separately.
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
