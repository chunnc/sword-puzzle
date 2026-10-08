import AsyncStorage from '@react-native-async-storage/async-storage';
import { BoardEngine } from '../BoardEngine';
import { getLevel } from '../levels';
import { emptySave, loadSave, normalizeSave, normalizeSnapshot, persistSave } from '../save';
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
describe('server-backed journal v3', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });
  it('ignores offline v1/v2 and their backups', async () => {
    for (const key of ['kiemkhai.save.v1', 'kiemkhai.save.backup.v1', 'kiemkhai.save.v2', 'kiemkhai.save.backup.v2']) await AsyncStorage.setItem(key, JSON.stringify({
      schemaVersion: 2,
      levels: [{
        levelId: 1,
        stars: 3
      }],
      profile: {
        coins: 99999
      }
    }));
    expect(await loadSave('player')).toEqual(emptySave());
  });
  it('restores a snapshot from its v3 backup without restoring a profile', async () => {
    const save = {
      ...emptySave(),
      ownerId: 'player',
      active: new BoardEngine(getLevel(1)).snapshot()
    };
    save.profile.coins = 999;
    await persistSave(save);
    await persistSave({
      ...save,
      active: null
    });
    await AsyncStorage.setItem('kiemkhai.save.v3', '{broken');
    const restored = await loadSave('player');
    expect(restored.active).toEqual(save.active);
    expect(restored.profile.coins).toBe(0);
  });
  it('does not restore another UID journal', async () => {
    await persistSave({
      ...emptySave(),
      ownerId: 'other',
      active: new BoardEngine(getLevel(1)).snapshot()
    });
    expect((await loadSave('player')).active).toBeNull();
  });
  it('preserves a pending zero-star result and its immutable ID', async () => {
    const save = {
      ...emptySave(),
      ownerId: 'player',
      pending: {
        contentVersion: 3,
        operation: {
          id: 'win_zero_123',
          kind: 'win' as const,
          levelId: 1,
          stars: 0 as const,
          objectiveProgress: {
            main: 18
          }
        }
      }
    };
    await persistSave(save);
    expect((await loadSave('player')).pending).toEqual(save.pending);
  });
  it('rejects malformed snapshots and incomplete progress maps', () => {
    const s = new BoardEngine(getLevel(1)).snapshot();
    expect(normalizeSnapshot({
      ...s,
      tiles: []
    })).toBeNull();
    expect(normalizeSnapshot({
      ...s,
      swordQi: 101
    })).toBeNull();
    expect(normalizeSnapshot({
      ...s,
      objectiveProgress: {}
    })).toBeNull();
    expect(normalizeSave({
      schemaVersion: 2
    })).toBeNull();
  });
  it('restores frozen loadout, RNG, charge, objectives and condensed status', () => {
    const save = {
        ...emptySave(),
        ownerId: 'player'
      },
      s = new BoardEngine(getLevel(1)).snapshot();
    s.tiles[0]!.chargeTier = 5;
    s.condensed = true;
    s.skillUsed = true;
    s.objectiveProgress.main = 4;
    save.active = s;
    expect(normalizeSave(save)!.active).toEqual(s);
  });
});
