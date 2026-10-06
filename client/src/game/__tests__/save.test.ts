import AsyncStorage from '@react-native-async-storage/async-storage';
import { BoardEngine } from '../BoardEngine';
import { getLevel } from '../levels';
import { emptySave, loadSave, normalizeSave, normalizeSnapshot, persistSave, projectProfile } from '../save';
import { applyOperation, emptyProfile } from '../domain';
import legacy from './unity-board-fixtures.json';
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
describe('save v2', () => {
    beforeEach(async () => { await AsyncStorage.clear(); });
    it('starts with free gear', async () => expect(await loadSave()).toEqual(emptySave()));
    it('migrates old stars once and discards old board snapshots', async () => { await AsyncStorage.setItem('kiemkhai.save.v1', JSON.stringify({ schemaVersion: 1, levels: [{ levelId: 1, stars: 2 }], active: legacy.levels[0].initial })); const save = await loadSave(); expect(save.profile.totalExp).toBe(80); expect(save.profile.coins).toBe(125); expect(save.active).toBeNull(); expect(save.operations[0].kind).toBe('importProgress'); expect((await loadSave()).operations[0].id).toBe(save.operations[0].id); });
    it('recovers a v2 backup before falling back to legacy', async () => { const save = emptySave(); save.active = new BoardEngine(getLevel(1)).snapshot(); await persistSave(save); await persistSave({ ...save, active: null }); await AsyncStorage.setItem('kiemkhai.save.v2', '{broken'); expect((await loadSave()).active).toEqual(save.active); });
    it('restores pending transactions without losing zero-star completion', () => { const save = emptySave(); save.operations = [{ id: 'win_zero_123', kind: 'win', levelId: 1, stars: 0 }]; save.profile = projectProfile(save.confirmed, save.operations); const restored = normalizeSave(save)!; expect(restored.profile.levels).toEqual([{ levelId: 1, stars: 0 }]); expect(restored.profile.totalExp).toBe(30); expect(restored.profile.coins).toBe(100); });
    it('rejects malformed snapshots and duplicated transaction IDs', () => { const s = new BoardEngine(getLevel(1)).snapshot(); expect(normalizeSnapshot({ ...s, tiles: [] })).toBeNull(); expect(normalizeSnapshot({ ...s, swordQi: 101 })).toBeNull(); const save = emptySave(); save.operations = [{ id: 'same_id_123', kind: 'win', levelId: 1, stars: 0 }, { id: 'same_id_123', kind: 'win', levelId: 1, stars: 0 }]; expect(normalizeSave(save)).toBeNull(); });
    it('preserves frozen loadout, RNG, charge and condensed status', () => { const save = emptySave(), s = new BoardEngine(getLevel(1)).snapshot(); s.tiles[0].chargeTier = 5; s.condensed = true; s.skillUsed = true; save.active = s; expect(normalizeSave(save)!.active).toEqual(s); });
});
