# Board animation phase isolation

Verified on iPhone 17 Pro simulator, iOS 26.3, using the isolated acceptance app and native Skia/Reanimated renderer. A temporary screen compared the committed renderer with the fix, then was removed. The fixture used a fixed 7×7 snapshot, 21 falling cells, a 300 ms settle, a clear affecting only cell 48, another fall, and idle. No gameplay operations or save writes were used.

## Native visual regression

These crops show cell 7, which falls in the first phase but is unaffected by the following clear. Frames were decoded from simulator H.264 recordings with AVFoundation. The baseline loses the sprite during the phase transition; the fixed renderer keeps it in place.

| Renderer | Before transition | During transition | After transition |
| --- | --- | --- | --- |
| Baseline | ![](baseline-before.png) | ![](baseline-transition.png) | ![](baseline-after.png) |
| Fixed | ![](fixed-before.png) | ![](fixed-transition.png) | ![](fixed-after.png) |

The baseline samples are video frames 28, 29 and 37; the fixed samples are frames 26, 35 and 46. Native video inspection is limited to this fixture and the unobstructed sampled cell; a system link-confirmation overlay covered the lower board during recording.

## Performance and memory

Both renderers ran the same eight cycles on the same simulator with the same UI-frame sampler and video recording enabled.

| Renderer | Sampled frames | Mean frame interval | Frames above 25 ms |
| --- | ---: | ---: | ---: |
| Baseline | 914 | 16.76 ms | 2 |
| Fixed | 901 | 16.74 ms | 1 |

The 95th percentile was below 17 ms for both. These are development simulator measurements of UI frame intervals, not production-device GPU benchmarks.

Three further fixed-renderer batches of six cycles each had mean intervals of 16.82, 16.67 and 16.84 ms. Hermes allocated JS memory at the ends of these batches was approximately 36.2, 40.9 and 39.1 MB, with a stable 54.5 MB JS heap. External-memory estimates fluctuated rather than growing monotonically. These short runs showed no sustained memory-growth trend; they do not establish long-duration leak freedom. One batch overlapped a development Fast Refresh. Raw numerical results are in [metrics.json](metrics.json).

## Automated coverage

The client suite passed: 22 suites, 320 tests. New coverage exercises delayed old-phase callbacks, fresh initial output before queued UI work runs, cleanup ownership, stable Canvas/sprite identity, equivalent-effect and HUD updates, run ID reuse, reduced motion, terminal states for fall/swap/clear/reject, cumulative clears, and sparse animated outputs. Gameplay timing and engine tests remain unchanged and pass.
