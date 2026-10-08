# Required text-to-video prompt blocks

Read when preparing a new animation. Write one complete English `video.prompt.txt`,
1–4096 characters. Include all five blocks below; headings are optional. The script
validates length, not the meaning of the prompt. Inspect the result before Feyn.

## 1. Effect and art style

Describe only the requested effect and components. Match the inspected game tiles:
polished 2D luminous xianxia mobile-game VFX, crisp readable silhouettes, clear color
shapes, soft painted gradients, restrained glow, consistent details across frames,
readable at 256px. Fire: coral red, amber orange, ivory-hot core. Lightning:
violet-blue with an ivory highlight. Describe other palettes from the actual assets
or user's reference. No photorealistic fire, cinematic simulation, 3D scene or style
drift. Reference images inform this description; they are not sent to the endpoint.

## 2. Explicit timed lifecycle

State what is visible at frame zero, how it grows/forms, when it peaks, how it
dissipates, and when only background remains. Give time ranges within 1 or 2 seconds.
The first frame must show the intended initial state, not a pre-expanded peak.
One coherent event only, no restart or loop. Tail particles and glow fade completely
before the end, leaving a brief background-only hold.

For a 2s explosion: a tiny central flame 5–10% of the full frame width at time zero;
growth 0–0.4s; peak 0.4–0.7s; gradual dissipation 0.7–1.8s; background only 1.8–2s.
For 1s halve all time marks. For a bolt or slash, replace this motion with its own
formation, strike and fading trail; do not impose a fire expansion sequence. Add
fragments, smoke or shockwaves only if requested. Particles fade before the safe edge.

## 3. Safe frame

Square composition with a logical 500×500 coordinate system. Every visible part,
including glow, smoke, fragments and sparks when present, stays inside the central
400×400 region x=50–450, y=50–450 throughout the entire event. This means a clear
10% background margin on every side at every moment, including the peak. No edge
clipping, offscreen motion or camera zoom to accommodate expansion. These are
composition instructions, not a request for a literal 500px video or drawn guides.

## 4. Camera and background

Fixed straight-on camera, stable center anchor and framing. Flat uniform saturated
chroma green for fire/lightning; if the effect contains green, explicitly choose a
contrasting chroma color. The background stays exactly the same color throughout,
including the end hold. No gradient, texture, horizon, floor, cast shadows or
background lighting changes. Do not ask for a transparent video: Feyn removes the
chroma background later.

## 5. Exclusions

No pan, tilt, zoom, camera shake, cuts, transitions, loop, text, logo, watermark,
border, coordinate grid, characters, board, tiles, ground or unrequested objects.
No full-screen flash, random flicker, abrupt shape changes or secondary eruption.

## Complete example: 2-second fire explosion

```text
Create one compact fire explosion as polished 2D luminous xianxia mobile-game VFX, matching crisp fantasy puzzle tiles. Clear flame silhouettes and color shapes, soft painted gradients, restrained glow, readable at 256px. Use coral-red outer flames, amber-orange inner flames and an ivory-hot core. Keep the same palette, rendering style and details throughout. No photorealism, cinematic fluid simulation or 3D scene.

Exactly one event over 2 seconds. At frame zero a tiny distinct tuft of fire is already visible at the center, only 5-10% of the full frame width; it is not a fully formed explosion. From 0.0-0.4s it rapidly grows outward from that fixed origin with curling flame tongues. From 0.4-0.7s it reaches one clear readable peak. From 0.7-1.8s the flames gradually thin, break down and fade, with the core and glow diminishing smoothly until completely gone. From 1.8-2.0s show only the unchanged background. No second eruption, restart or loop. Do not add smoke, fragments or shockwaves.

Square framing with a logical 500x500 canvas. ALL effect content, including the faint outer glow, stays inside the central 400x400 region x=50-450, y=50-450 at EVERY moment, including the peak. Maintain a clear 10% background margin on all four sides. Scale the explosion to fit these bounds. No cropped flames, clipped glow or offscreen movement. Do not draw borders, grids or coordinates.

Fixed straight-on camera, stable center anchor, unchanged framing. Flat uniform saturated chroma-green background for the full clip, including the final hold; no gradient, texture, floor, horizon, cast shadows or background illumination changes.

No pan, tilt, zoom, shake, cuts, transitions, text, logos, watermarks, characters, game board, tiles, ground or unrelated objects. No full-frame flash, random flicker, sudden shape changes, style drift or camera adjustment to fit expansion.
```
