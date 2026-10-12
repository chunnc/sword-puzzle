# Gameplay objective artwork

Generated with Codex's built-in ImageGen using `client/app-assets/ui/gameplay_objective_v3.webp` as the style reference. Both originals retain their generated transparency.

| Panel | Original | Final prompt | Runtime asset |
| --- | --- | --- | --- |
| Boss / enemy | [gameplay-boss-panel.png](gameplay-boss-panel.png) | [Boss prompt](gameplay-boss-panel.prompt.txt) | [1120 × 154 PNG](../../../client/app-assets/ui/gameplay_boss_panel.png) |
| Collection / obstacles | [gameplay-collection-panel.png](gameplay-collection-panel.png) | [Collection prompt](gameplay-collection-panel.prompt.txt) | [1120 × 136 PNG](../../../client/app-assets/ui/gameplay_collection_panel.png) |

Runtime preparation removes transparent margins and downsizes proportionally, preserving alpha. The boss crop is 2168 × 298 at x=2, y=208 in its original; the collection crop is 2026 × 247 at x=9, y=262. Both runtime images are 1120 pixels wide.

`GameplayObjectivePanel` renders three clipped Skia regions from each image. Each end cap uses 0.75 times the source image height and scales uniformly with the panel height. Only the quiet middle changes horizontal scale. Boss heights are 60/52 dp and collection heights are 48/44 dp; full-width layouts therefore preserve the shape of the rounded ends and ornamentation.

Completed counters use success green and retain actual counts beyond the target. Saves retain these counts; reports sent to the existing server are capped per objective. The preview route used for simulator QA was removed after screenshots.
