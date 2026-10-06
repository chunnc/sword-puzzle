import { getLevelData } from './domain';
import { GoalKind, LevelDefinition, TileKind } from './types';
export { LEVEL_COUNT } from './domain';
export function getLevel(id: number): LevelDefinition {
    const data = getLevelData(id);
    return { ...data, goal: data.goal as GoalKind, collectKind: data.collectKind as TileKind };
}
