import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyOperation, emptyProfile, highestUnlocked, normalizeLevels, normalizeProfile, parseOperation, profileFromLegacy, SKILLS, SWORDS, type PlayerOperation, type PlayerProfile } from './domain';
import { newId } from './BoardEngine';
import type { BoardSnapshot, SaveData } from './types';
const SAVE_KEY = 'kiemkhai.save.v2';
const BACKUP_KEY = 'kiemkhai.save.backup.v2';
export function emptySave(): SaveData { const profile = emptyProfile(); return { schemaVersion: 2, ownerId: null, confirmed: profile, operations: [], profile, active: null, lastWin: null }; }
export function projectProfile(confirmed: PlayerProfile, operations: PlayerOperation[]): PlayerProfile {
    return operations.reduce((profile, op) => applyOperation(profile, op).profile, confirmed);
}
export function normalizeSave(raw: unknown): SaveData | null {
    if (!raw || typeof raw !== 'object')
        return null;
    const value = raw as Record<string, unknown>;
    if (value.schemaVersion === 1 && Array.isArray(value.levels)) {
        const levels = normalizeLevels(value.levels);
        const operation: PlayerOperation = { id: newId(), kind: 'importProgress', levels };
        const confirmed = emptyProfile();
        return { ...emptySave(), confirmed, operations: levels.length ? [operation] : [], profile: profileFromLegacy(levels) };
    }
    if (value.schemaVersion !== 2 || !Array.isArray(value.operations))
        return null;
    const confirmed = normalizeProfile(value.confirmed);
    if (!confirmed)
        return null;
    const ids = new Set<string>();
    const operations: PlayerOperation[] = [];
    for (const rawOp of value.operations) {
        const op = parseOperation(rawOp);
        if (!op || ids.has(op.id))
            return null;
        ids.add(op.id);
        operations.push(op);
    }
    const profile = projectProfile(confirmed, operations);
    const active = normalizeSnapshot(value.active);
    return { schemaVersion: 2, ownerId: typeof value.ownerId === 'string' ? value.ownerId : null, confirmed, operations, profile, active: active && active.levelId <= highestUnlocked(profile.levels) ? active : null, lastWin: null };
}
export function normalizeSnapshot(raw: unknown): BoardSnapshot | null {
    if (!raw || typeof raw !== 'object')
        return null;
    const p = raw as BoardSnapshot;
    if (p.contentVersion !== 2 || typeof p.runId !== 'string' || !/^[a-zA-Z0-9_-]{8,120}$/.test(p.runId) || !Number.isInteger(p.levelId) || p.levelId < 1 || p.levelId > 40 || !Number.isInteger(p.moves) || p.moves < 0 || p.moves > 27 || !Number.isInteger(p.remaining) || p.remaining < 0 || !Number.isInteger(p.swordQi) || p.swordQi < 0 || p.swordQi > 100 || !Number.isSafeInteger(p.score) || p.score < 0 || !Number.isSafeInteger(p.drops) || p.drops < 0 || !Number.isInteger(p.randomState) || !Number.isFinite(p.damageScale) || p.damageScale < 1 || p.damageScale > 20 || typeof p.extraMovesUsed !== 'boolean' || typeof p.condensed !== 'boolean' || typeof p.skillUsed !== 'boolean' || !Array.isArray(p.tiles) || p.tiles.length !== 49 || !p.loadout || !Array.isArray(p.loadout.skills) || p.loadout.skills.length < 1 || p.loadout.skills.length > 2 || new Set(p.loadout.skills).size !== p.loadout.skills.length || !p.loadout.skills.every(id => SKILLS.some(s => s.id === id)) || !SWORDS.some(s => s.id === p.loadout.sword))
        return null;
    if (!p.tiles.every(t => t && Number.isInteger(t.kind) && t.kind >= 0 && t.kind <= 4 && [0, 4, 5].includes(t.chargeTier) && typeof t.locked === 'boolean' && (t.kind !== 4 || t.chargeTier === 0 && !t.locked)))
        return null;
    return { ...p, tiles: p.tiles.map(t => ({ ...t })), loadout: { ...p.loadout, skills: [...p.loadout.skills] } };
}
export async function loadSave(): Promise<SaveData> {
    for (const key of [SAVE_KEY, BACKUP_KEY, 'kiemkhai.save.v1', 'kiemkhai.save.backup.v1']) {
        try {
            const raw = await AsyncStorage.getItem(key);
            if (!raw)
                continue;
            const save = normalizeSave(JSON.parse(raw));
            if (save) {
                if (key !== SAVE_KEY)
                    await persistSave(save);
                return save;
            }
        }
        catch { /* Try the next backup. */ }
    }
    return emptySave();
}
let queue = Promise.resolve();
export function persistSave(save: SaveData): Promise<void> {
    const json = JSON.stringify(save);
    queue = queue.catch(() => undefined).then(async () => {
        const old = await AsyncStorage.getItem(SAVE_KEY);
        if (old)
            await AsyncStorage.setItem(BACKUP_KEY, old);
        await AsyncStorage.setItem(SAVE_KEY, json);
    });
    return queue;
}
export async function archiveProfile(save: SaveData): Promise<void> {
    await AsyncStorage.setItem(`kiemkhai.profile.${save.ownerId ?? 'local'}`, JSON.stringify(save));
}
export async function loadArchivedProfile(ownerId: string): Promise<SaveData | null> {
    try {
        const raw = await AsyncStorage.getItem(`kiemkhai.profile.${ownerId}`);
        return raw ? normalizeSave(JSON.parse(raw)) : null;
    }
    catch {
        return null;
    }
}
