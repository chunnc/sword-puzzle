# Map and content revisions

## Storage

- `gameConfig/current` selects the active content version and catalog revision.
- `gameContent/{version}` stores immutable global rules and progression data without layouts.
- `gameMaps/{mapId}` uses a numeric ID, chapter/order metadata, a latest map revision and
  the encoded revision list. Published maps use `layoutRows: [{cells: [...]}]`.
- Runs pin the selected numeric map resource, map revision, content version, seed, loadout,
  retry support and idempotent result receipt.

A map revision changes when its authored payload changes. A config revision is required for
global rules or progression changes. Every publication increments `catalogRevision` so map
lists refresh. Chapter summaries exclude layouts; starting a run returns the full selected map.

## Client saves and progression

Catalog v8 uses two tutorial maps. Client 1.8.0 stores tutorial progress in save schema 4.
The prior save schema is ignored on restore; device session credentials are stored separately.
Player progression remains server-owned and normalized to the active two-map catalog. Adding
later maps reuses their stable numeric IDs and appends chapter ranges.

The API keeps profile, login, device binding and run idempotency separate from map authoring.
Gameplay result settlement checks every objective, calculates percentage stars and credits
rewards once. Same-star replays do not regrant EXP or star bonuses.

## Catalog reset

The local authoring catalog can shrink from 40 maps to two after map resources have been
removed from the target project. `--reset-catalog` is required when the current config has more
levels than the new config. The seed command verifies that `gameMaps` is empty before allowing
the shrink, writes only the new content and map resources, and preserves unrelated current
configuration fields. Normal catalog growth and map revision checks remain in place.
