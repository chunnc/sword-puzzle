// Test helpers use the authored tutorial maps; production runs are always server selected.
import { installContent, mapToLevel, validateMap, type GameContent } from './domain';
const config = require('../../../content/game-config.json');
const maps = require('../../../content/game-maps.json');
export { LEVEL_COUNT } from './domain';
export function getLevel(id: number, content?: GameContent) {
  const current = content ?? installContent(config);
  const raw = structuredClone(maps[0]);
  raw.name = `Engine fixture ${id}`;
  raw.layout = Array.from({ length: 7 }, (_, y) => Array.from({ length: 7 }, (_, x) => current.normalTileIds[(x + 2*y) % 4]));
  // Keep the deterministic test board match-free while providing one known legal
  // move. Production runs use server-authored layouts and do not use this helper.
  raw.layout[0][0] = current.normalTileIds[0];
  raw.layout[0][1] = current.normalTileIds[1];
  raw.layout[0][2] = current.normalTileIds[0];
  raw.layout[1][1] = current.normalTileIds[0];
  raw.objectives = [{ id: 'main', type: 'Battle', target: 100_000, enemy: { id: 'fixture', name: 'Fixture', artKey: 'beast' } }];
  delete raw.tutorial;
  raw.moves = 18;
  const map = validateMap(raw, current);
  const level = mapToLevel(map, 24680, 0, current);
  level.id = id;
  return level;
}
