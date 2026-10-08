import { getLevelData, type GameContent } from './domain';
export { LEVEL_COUNT } from './domain';
export function getLevel(id: number, content?: GameContent) { return getLevelData(id, content); }
