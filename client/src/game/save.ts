import AsyncStorage from '@react-native-async-storage/async-storage';
import { emptyProfile, getContentVersion, parseOperation, mapToLevel, validateMap, tileId } from './domain';
import type { BoardSnapshot, SaveData, WinSummary } from './types';
import { toRunReportProgress } from './objectiveProgress';
const SAVE_KEY = 'kiemkhai.save.v4',
  BACKUP_KEY = 'kiemkhai.save.backup.v4',
  OBSOLETE_KEYS = ['kiemkhai.save.v3', 'kiemkhai.save.backup.v3'];
export function emptySave(): SaveData {
  return {
    schemaVersion: 4,
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
    if (p.configVersion !== undefined && p.configVersion !== p.contentVersion || p.totalExpAtStart !== undefined && (!Number.isSafeInteger(p.totalExpAtStart) || p.totalExpAtStart < 0)) return null;
    const content = getContentVersion(p.configVersion ?? p.contentVersion);
    if (content.version < 8 || !p.level.mapDefinition) return null;
    const level = mapToLevel(validateMap(p.level.mapDefinition, content), p.level.seed, p.level.assistReduction, content);
    if (level.id !== p.levelId || !Number.isSafeInteger(level.seed) || level.seed <= 0 || level.seed > 0xffffffff || !Number.isFinite(level.assistReduction ?? 0) || (level.assistReduction ?? 0) < 0 || (level.assistReduction ?? 0) > .3 || p.directorPressure !== undefined && (!Number.isFinite(p.directorPressure) || p.directorPressure < 0 || p.directorPressure > 1.2)) return null;
    if (p.passiveSkills !== undefined && (!Array.isArray(p.passiveSkills) || new Set(p.passiveSkills).size !== p.passiveSkills.length || !p.passiveSkills.every(id => content.skills.some(s => s.id === id && s.kind === 'passive')))) return null;
    if (p.mapVersion !== undefined && p.mapVersion !== level.mapVersion) return null;
    if (typeof p.runId !== 'string' || !/^[a-zA-Z0-9_-]{8,120}$/.test(p.runId) || !Number.isSafeInteger(p.moves) || p.moves < 0 || p.moves > level.moves + 3 || !p.objectiveProgress || Object.keys(p.objectiveProgress).length !== level.objectives.length || !level.objectives.every(o => Number.isSafeInteger(p.objectiveProgress[o.id]) && p.objectiveProgress[o.id] >= 0 && ((o.type !== 'Battle' && o.type !== 'Boss') || p.objectiveProgress[o.id] <= o.target)) || !Number.isSafeInteger(p.swordQi) || p.swordQi < 0 || p.swordQi > content.qiCap || !Number.isSafeInteger(p.score) || p.score < 0 || !Number.isSafeInteger(p.drops) || p.drops < 0 || !Number.isSafeInteger(p.randomState) || p.randomState <= 0 || p.randomState > 0xffffffff || !Number.isFinite(p.damageScale) || p.damageScale < 1 || typeof p.extraMovesUsed !== 'boolean' || typeof p.condensed !== 'boolean' || typeof p.skillUsed !== 'boolean' || !Array.isArray(p.tiles) || p.tiles.length !== level.board.activeCells.length || !p.loadout || !Array.isArray(p.loadout.skills) || p.loadout.skills.length > 2 || new Set(p.loadout.skills).size !== p.loadout.skills.length || !p.loadout.skills.every(id => content.skills.some(s => s.id === id && s.kind !== 'passive')) || p.loadout.sword !== null && !content.swords.some(s => s.id === p.loadout.sword)) return null;
    if (!p.tiles.every((t, i) => !level.board.activeCells[i] ? t === null : t && content.tiles.some(def => def.id === t.kind) && [0, 4, 5].includes(t.chargeTier) && typeof t.locked === 'boolean' && (t.kind !== tileId('rock', content) || t.chargeTier === 0 && !t.locked))) return null;
    if (level.mapDefinition?.tutorial ? !(p.tutorialStep === null || Number.isSafeInteger(p.tutorialStep) && p.tutorialStep! >= 0 && p.tutorialStep! < level.mapDefinition.tutorial.steps.length) : p.tutorialStep !== undefined) return null;
    return {
      ...p,
      level,
      objectiveProgress: {
        ...p.objectiveProgress
      },
      tiles: p.tiles.map(t => t ? {
        ...t
      } : null),
      passiveSkills: [...(p.passiveSkills ?? [])],
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
  if (value.schemaVersion !== 4 || typeof value.ownerId !== 'string') return null;
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
  const validId = (id: unknown) => typeof id === 'string' && /^[a-zA-Z0-9_-]{8,120}$/.test(id);
  if (value.pendingStart) {
    const p = value.pendingStart;
    try {
      if (!validId(p.runId) || !Number.isSafeInteger(p.levelId) || p.levelId < 1 || p.previousRunId !== null && !validId(p.previousRunId) || p.previousRunId === p.runId) return null;
    } catch { return null; }
  }
  if (value.pendingFinish) {
    const p = value.pendingFinish, report = p.report;
    const expectedProgress = active ? toRunReportProgress(active.level, active.objectiveProgress) : {};
    if (!active?.level.mapDefinition || p.runId !== active.runId || p.levelId !== active.levelId || p.contentVersion !== active.contentVersion
      || !report || !['won','lost','abandoned'].includes(report.outcome) || !Number.isSafeInteger(report.movesUsed) || report.movesUsed < 0 || report.movesUsed > active.level.moves + (active.extraMovesUsed ? 3 : 0)
      || report.extraMovesUsed !== active.extraMovesUsed || Object.keys(report.objectiveProgress ?? {}).length !== active.level.objectives.length || !active.level.objectives.every(o => report.objectiveProgress?.[o.id] === expectedProgress[o.id])) return null;
  }
  if (value.pendingEnergyLoss) {
    const pending = value.pendingEnergyLoss, report = pending.report;
    if (!active?.level.mapDefinition || pending.runId !== active.runId || pending.levelId !== active.levelId
      || pending.contentVersion !== active.contentVersion || !report || report.outcome !== 'lost'
      || !Number.isSafeInteger(report.movesUsed) || report.movesUsed < active.level.moves + (report.extraMovesUsed ? 3 : 0)
      || typeof report.extraMovesUsed !== 'boolean' || !report.objectiveProgress
      || Object.keys(report.objectiveProgress).length !== active.level.objectives.length
      || !active.level.objectives.every(o => Number.isSafeInteger(report.objectiveProgress[o.id])
        && report.objectiveProgress[o.id] >= 0 && report.objectiveProgress[o.id] <= o.target
        && report.objectiveProgress[o.id] < o.target)) return null;
  }
  const validItems = w?.itemsGranted === undefined || Array.isArray(w.itemsGranted) && w.itemsGranted.every(item => item && ['skill', 'sword'].includes(item.category) && typeof item.itemId === 'string');
  const lastWin: WinSummary | null = w && validItems && typeof w.runId === 'string' && ['levelId', 'stars', 'bestStars', 'expGained', 'totalExp', 'coinsGained', 'realmBefore', 'realmAfter'].every(k => Number.isSafeInteger(w[k as keyof WinSummary]) && Number(w[k as keyof WinSummary]) >= 0) ? w : null;
  return {
    ...emptySave(),
    ownerId: value.ownerId,
    active,
    pending,
    lastWin,
    ...(value.pendingStart ? { pendingStart: { runId: value.pendingStart.runId, levelId: value.pendingStart.levelId, previousRunId: value.pendingStart.previousRunId } } : {}),
    ...(value.pendingEnergyLoss ? { pendingEnergyLoss: value.pendingEnergyLoss } : {}),
    ...(validId(value.energyConsumedRunId) && active?.runId === value.energyConsumedRunId ? { energyConsumedRunId: value.energyConsumedRunId } : {}),
    ...(value.pendingFinish ? { pendingFinish: value.pendingFinish } : {}),
    ...(value.retiredRunId && active?.runId === value.retiredRunId ? { retiredRunId: value.retiredRunId } : {})
  };
}
export async function loadSave(ownerId?: string): Promise<SaveData> {
  await Promise.all(OBSOLETE_KEYS.map(key => AsyncStorage.removeItem(key)));
  for (const key of [SAVE_KEY, BACKUP_KEY]) {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) continue;
    let value: SaveData;
    try {
      value = JSON.parse(raw);
    } catch {
      continue;
    }
    if (value.schemaVersion !== 4 || ownerId && value.ownerId !== ownerId) continue;
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
