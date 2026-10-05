import AsyncStorage from '@react-native-async-storage/async-storage';
import { LEVEL_COUNT } from './levels';
import { BoardSnapshot, LevelStar, SaveData, Tile, TileKind, SpecialKind } from './types';

const SAVE_KEY = 'kiemkhai.save.v1';
const BACKUP_KEY = 'kiemkhai.save.backup.v1';

export function emptySave(): SaveData {
  return { schemaVersion: 1, levels: [], active: null };
}

export function normalizeSave(value: unknown): SaveData | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<SaveData>;
  if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.levels)) return null;
  const byId = new Map<number, number>();
  for (const raw of candidate.levels) {
    if (!raw || !Number.isInteger(raw.levelId) || !Number.isInteger(raw.stars)) continue;
    if (raw.levelId! < 1 || raw.levelId! > LEVEL_COUNT || raw.stars! < 1 || raw.stars! > 3) continue;
    byId.set(raw.levelId!, Math.max(byId.get(raw.levelId!) ?? 0, raw.stars!));
  }
  const levels: LevelStar[] = [];
  for (let levelId = 1; levelId <= LEVEL_COUNT; levelId += 1) {
    const stars = byId.get(levelId);
    if (stars === undefined) break;
    levels.push({ levelId, stars });
  }
  const active = normalizeSnapshot(candidate.active);
  const allowedLevel = Math.min(LEVEL_COUNT, levels.length + 1);
  return {
    schemaVersion: 1,
    levels,
    active: active && active.levelId <= allowedLevel ? active : null,
  };
}

export function normalizeSnapshot(value: unknown): BoardSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<BoardSnapshot>;
  if (
    !Number.isInteger(candidate.levelId) || candidate.levelId! < 1 || candidate.levelId! > LEVEL_COUNT ||
    !Number.isInteger(candidate.moves) || !Number.isInteger(candidate.remaining) ||
    !Number.isInteger(candidate.swordQi) || !Number.isInteger(candidate.score) ||
    !Number.isInteger(candidate.drops) || !Number.isInteger(candidate.randomState) ||
    typeof candidate.extraMovesUsed !== 'boolean' || !Array.isArray(candidate.tiles) || candidate.tiles.length !== 49
  ) return null;
  const tiles: Tile[] = [];
  for (const raw of candidate.tiles) {
    if (!raw || typeof raw !== 'object') return null;
    const tile = raw as Tile;
    if (
      !Number.isInteger(tile.kind) || tile.kind < TileKind.Sword || tile.kind > TileKind.Rock ||
      !Number.isInteger(tile.special) || !(tile.special === SpecialKind.None || tile.special === SpecialKind.Slash ||
        tile.special === SpecialKind.Omni || tile.special === 99) || typeof tile.locked !== 'boolean'
    ) return null;
    tiles.push({ kind: tile.kind, special: tile.special, locked: tile.locked });
  }
  return {
    levelId: candidate.levelId!,
    moves: candidate.moves!,
    remaining: candidate.remaining!,
    swordQi: candidate.swordQi!,
    score: candidate.score!,
    drops: candidate.drops!,
    randomState: candidate.randomState!,
    extraMovesUsed: candidate.extraMovesUsed,
    tiles,
  };
}

export async function loadSave(): Promise<SaveData> {
  for (const key of [SAVE_KEY, BACKUP_KEY]) {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) continue;
      const parsed = normalizeSave(JSON.parse(raw));
      if (parsed) return parsed;
    } catch {
      // A corrupt save falls through to the backup or a fresh local save.
    }
  }
  return emptySave();
}

let persistQueue = Promise.resolve();

export function persistSave(save: SaveData): Promise<void> {
  const snapshot = JSON.stringify(save);
  persistQueue = persistQueue.catch(() => undefined).then(async () => {
    const old = await AsyncStorage.getItem(SAVE_KEY);
    if (old) await AsyncStorage.setItem(BACKUP_KEY, old);
    await AsyncStorage.setItem(SAVE_KEY, snapshot);
  });
  return persistQueue;
}

export function mergeStars(local: LevelStar[], remote: LevelStar[]): LevelStar[] {
  const merged = new Map(local.map(({ levelId, stars }) => [levelId, stars]));
  for (const result of remote) {
    if (!Number.isInteger(result.levelId) || result.levelId < 1 || result.levelId > LEVEL_COUNT) continue;
    if (!Number.isInteger(result.stars) || result.stars < 1 || result.stars > 3) continue;
    merged.set(result.levelId, Math.max(merged.get(result.levelId) ?? 0, result.stars));
  }
  const sequential: LevelStar[] = [];
  for (let levelId = 1; levelId <= LEVEL_COUNT; levelId += 1) {
    const stars = merged.get(levelId);
    if (stars === undefined) break;
    sequential.push({ levelId, stars });
  }
  return sequential;
}

export function completedCount(levels: LevelStar[]): number {
  let completed = 0;
  while (completed < LEVEL_COUNT && levels.some((level) => level.levelId === completed + 1 && level.stars > 0)) {
    completed += 1;
  }
  return completed;
}

export function starsForLevel(levels: LevelStar[], levelId: number): number {
  return levels.find((level) => level.levelId === levelId)?.stars ?? 0;
}
