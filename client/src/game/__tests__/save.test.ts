import AsyncStorage from '@react-native-async-storage/async-storage';
import { emptySave, loadSave, normalizeSave, persistSave } from '../save';
import boardFixtures from './unity-board-fixtures.json';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('local save', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('starts a fresh offline save when there is no stored data', async () => {
    await expect(loadSave()).resolves.toEqual(emptySave());
  });

  it('recovers the backup if the primary JSON is corrupt', async () => {
    const recovered = { schemaVersion: 1 as const, levels: [{ levelId: 1, stars: 2 }], active: boardFixtures.levels[0].initial };
    await AsyncStorage.setItem('kiemkhai.save.v1', '{broken');
    await AsyncStorage.setItem('kiemkhai.save.backup.v1', JSON.stringify(recovered));
    await expect(loadSave()).resolves.toEqual(recovered);
  });

  it('backs up the previous save before writing an accepted move snapshot', async () => {
    const first = { ...emptySave(), levels: [{ levelId: 1, stars: 1 }], active: null };
    const second = { ...first, active: boardFixtures.levels[0].afterMove };
    await persistSave(first);
    await persistSave(second);
    await expect(AsyncStorage.getItem('kiemkhai.save.backup.v1')).resolves.toBe(JSON.stringify(first));
    await expect(loadSave()).resolves.toEqual(second);
  });

  it('drops progress after a gap and rejects malformed board snapshots', () => {
    const normalized = normalizeSave({
      schemaVersion: 1,
      levels: [{ levelId: 1, stars: 2 }, { levelId: 3, stars: 3 }],
      active: { ...boardFixtures.levels[0].initial, tiles: [] },
    });
    expect(normalized).toEqual({ schemaVersion: 1, levels: [{ levelId: 1, stars: 2 }], active: null });
  });
});
