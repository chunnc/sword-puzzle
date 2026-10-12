import { BoardEngine } from '../../../game/BoardEngine';
import { CONTENT, mapToLevel, tileId, validateMap, type LevelDefinition, type ObjectiveDefinition } from '../../../game/domain';
import { getLevel } from '../../../game/levels';
import type { BoardSnapshot } from '../../../game/types';

// UI tests restore a snapshot so their layout assertions do not depend on the
// shared engine fixture having a legal initial move or on starter equipment.
export function gameplaySnapshot(level: LevelDefinition = getLevel(15)): BoardSnapshot {
  const authored = mapToLevel(validateMap(require('../../../../../content/game-maps.json')[0], CONTENT), 24680, 0, CONTENT);
  const snapshot = new BoardEngine(authored).snapshot();
  return {
    ...snapshot, level, levelId: level.id, moves: level.moves,
    objectiveProgress: Object.fromEntries(level.objectives.map(goal => [goal.id, 0])),
    tiles: Array.from({ length: level.board.width * level.board.height }, (_, index) =>
      level.board.activeCells[index] ? { kind: CONTENT.normalTileIds[index % CONTENT.normalTileIds.length], chargeTier: 0 as const, locked: false } : null),
    loadout: { sword: 'co-ban' as const, skills: ['nhat-kiem' as const] },
  };
}

export function goalLevel(type: ObjectiveDefinition['type']) {
  const objective: ObjectiveDefinition = type === 'Collect'
    ? { id: 'main', type, tileKind: tileId('sword', CONTENT), target: 15 }
    : type === 'Battle' || type === 'Boss'
      ? { id: 'main', type, target: 300, enemy: { id: 'enemy', name: type === 'Boss' ? 'Yêu vương' : 'Yêu thú', artKey: 'beast' } }
      : { id: 'main', type, target: 3 };
  return { ...getLevel(15), objectives: [objective] };
}
