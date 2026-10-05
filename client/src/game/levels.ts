import { GoalKind, LevelDefinition, TileKind } from './types';

export const LEVEL_COUNT = 3;

export function getLevel(id: number): LevelDefinition {
  if (!Number.isInteger(id) || id < 1 || id > LEVEL_COUNT) {
    throw new RangeError(`Unknown level: ${id}`);
  }

  return {
    id,
    chapter: 'Vân Hải Tiên Sơn',
    moves: id === 3 ? 24 : 20,
    goal: id === 3 ? GoalKind.Boss : id === 2 ? GoalKind.Battle : GoalKind.Collect,
    collectKind: TileKind.Herb,
    target: id === 3 ? 144 : id === 2 ? 72 : 6,
    rocks: id === 3 ? 2 : id === 2 ? 1 : 0,
    seals: id === 3 ? 2 : 0,
    seed: 7919 + id * 104729,
  };
}

export function realmForCompleted(completed: number): string {
  return completed >= LEVEL_COUNT ? 'Trúc Cơ' : 'Luyện Khí';
}
