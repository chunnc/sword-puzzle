import AsyncStorage from '@react-native-async-storage/async-storage';
import { emptyProfile, getContentVersion, getLevelData, parseOperation, registerContent, type GameContent } from './domain';
import type { BoardSnapshot, SaveData, WinSummary } from './types';
const SAVE_KEY = 'kiemkhai.save.v3',
  BACKUP_KEY = 'kiemkhai.save.backup.v3';
export function emptySave(): SaveData {
  return {
    schemaVersion: 3,
    ownerId: null,
    profile: emptyProfile(),
    active: null,
    lastWin: null,
    pending: null
  };
}
export function normalizeSnapshot(raw: unknown): BoardSnapshot | null {
  try {
    const p = raw as BoardSnapshot;
    const content = getContentVersion(p.contentVersion),
      level = getLevelData(p.levelId, content);
    if (typeof p.runId !== 'string' || !/^[a-zA-Z0-9_-]{8,120}$/.test(p.runId) || !Number.isSafeInteger(p.moves) || p.moves < 0 || p.moves > level.moves + 3 || !p.objectiveProgress || Object.keys(p.objectiveProgress).length !== level.objectives.length || !level.objectives.every(o => Number.isSafeInteger(p.objectiveProgress[o.id]) && p.objectiveProgress[o.id] >= 0 && p.objectiveProgress[o.id] <= o.target) || !Number.isSafeInteger(p.swordQi) || p.swordQi < 0 || p.swordQi > content.qiCap || !Number.isSafeInteger(p.score) || p.score < 0 || !Number.isSafeInteger(p.drops) || p.drops < 0 || !Number.isSafeInteger(p.randomState) || p.randomState <= 0 || p.randomState > 0xffffffff || !Number.isFinite(p.damageScale) || p.damageScale < 1 || typeof p.extraMovesUsed !== 'boolean' || typeof p.condensed !== 'boolean' || typeof p.skillUsed !== 'boolean' || !Array.isArray(p.tiles) || p.tiles.length !== level.board.activeCells.length || !p.loadout || !Array.isArray(p.loadout.skills) || p.loadout.skills.length < 1 || p.loadout.skills.length > 2 || new Set(p.loadout.skills).size !== p.loadout.skills.length || !p.loadout.skills.every(id => content.skills.some(s => s.id === id)) || !content.swords.some(s => s.id === p.loadout.sword)) return null;
    if (!p.tiles.every((t, i) => !level.board.activeCells[i] ? t === null : t && Number.isInteger(t.kind) && t.kind >= 0 && t.kind <= 4 && [0, 4, 5].includes(t.chargeTier) && typeof t.locked === 'boolean' && (t.kind !== 4 || t.chargeTier === 0 && !t.locked))) return null;
    return {
      ...p,
      level,
      objectiveProgress: {
        ...p.objectiveProgress
      },
      tiles: p.tiles.map(t => t ? {
        ...t
      } : null),
      loadout: {
        ...p.loadout,
        skills: [...p.loadout.skills]
      }
    };
  } catch {
    return null;
  }
}
export function normalizeSave(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as SaveData;
  if (value.schemaVersion !== 3 || typeof value.ownerId !== 'string') return null;
  const active = value.active ? normalizeSnapshot(value.active) : null;
  if (value.active && !active) return null;
  let pending: SaveData['pending'] = null;
  if (value.pending) {
    try {
      const operation = parseOperation(value.pending.operation, getContentVersion(value.pending.contentVersion));
      if (!operation) return null;
      pending = {
        contentVersion: value.pending.contentVersion,
        operation
      };
    } catch {
      return null;
    }
  }
  const w = value.lastWin;
  const lastWin: WinSummary | null = w && typeof w.runId === 'string' && ['levelId', 'stars', 'bestStars', 'expGained', 'totalExp', 'coinsGained', 'realmBefore', 'realmAfter'].every(k => Number.isSafeInteger(w[k as keyof WinSummary]) && Number(w[k as keyof WinSummary]) >= 0) ? w : null;
  return {
    ...emptySave(),
    ownerId: value.ownerId,
    active,
    pending,
    lastWin
  };
}
export async function loadSave(ownerId?: string, resolveContent?: (version: number) => Promise<GameContent>): Promise<SaveData> {
  for (const key of [SAVE_KEY, BACKUP_KEY]) {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) continue;
    let value: SaveData;
    try {
      value = JSON.parse(raw);
    } catch {
      continue;
    }
    if (value.schemaVersion !== 3 || ownerId && value.ownerId !== ownerId) continue;
    if (resolveContent) for (const version of new Set([value.active?.contentVersion, value.pending?.contentVersion].filter((v): v is number => typeof v === 'number'))) registerContent(await resolveContent(version));
    const save = normalizeSave(value);
    if (save) return save;
  }
  return emptySave();
}
let queue = Promise.resolve();
export function persistSave(save: SaveData): Promise<void> {
  // Profile is fetched from the server each boot, never restored from this journal.
  const {
    profile,
    ...journal
  } = save;
  const json = JSON.stringify(journal);
  queue = queue.catch(() => undefined).then(async () => {
    const old = await AsyncStorage.getItem(SAVE_KEY);
    if (old) await AsyncStorage.setItem(BACKUP_KEY, old);
    await AsyncStorage.setItem(SAVE_KEY, json);
  });
  return queue;
}
export async function clearSave(): Promise<void> {
  await queue.catch(() => undefined);
  await AsyncStorage.multiRemove([SAVE_KEY, BACKUP_KEY]);
}
