using System;
using System.IO;
using UnityEngine;
using KiemKhaiTienLo.Core;

namespace KiemKhaiTienLo.App
{
    [Serializable]
    public sealed class LevelStar { public int levelId; public int stars; }

    [Serializable]
    public sealed class ProgressPayload
    {
        public LevelStar[] levels = Array.Empty<LevelStar>();
        public int highestUnlocked = 1;
        public string realm = "LuyenKhi";
    }

    [Serializable]
    public sealed class SaveData
    {
        public LevelStar[] levels = Array.Empty<LevelStar>();
        public BoardSnapshot active;
    }

    public sealed class LocalSave
    {
        private readonly string path;
        private SaveData data;

        public LocalSave()
        {
            path = Path.Combine(Application.persistentDataPath, "progress.json");
            data = Load();
        }

        public BoardSnapshot Active => data.active;
        public int TotalStars
        {
            get { int sum = 0; foreach (var item in data.levels) sum += item.stars; return sum; }
        }
        public int HighestUnlocked
        {
            get
            {
                int completed = 0;
                while (completed < LevelCatalog.Count && Stars(completed + 1) > 0) completed++;
                return Math.Min(LevelCatalog.Count, completed + 1);
            }
        }
        public string Realm => LevelCatalog.RealmForCompleted(HighestUnlocked - 1);

        public int Stars(int levelId)
        {
            foreach (var item in data.levels)
                if (item.levelId == levelId) return item.stars;
            return 0;
        }

        public void SaveBoard(BoardSnapshot snapshot)
        {
            data.active = snapshot;
            Persist();
        }

        public void ClearBoard()
        {
            data.active = null;
            Persist();
        }

        public void Complete(int levelId, int stars)
        {
            if (levelId < 1 || levelId > LevelCatalog.Count || stars < 1 || stars > 3) return;
            int previous = Stars(levelId);
            if (stars > previous)
            {
                var next = new LevelStar[data.levels.Length + (previous == 0 ? 1 : 0)];
                Array.Copy(data.levels, next, data.levels.Length);
                if (previous == 0) next[next.Length - 1] = new LevelStar { levelId = levelId, stars = stars };
                else foreach (var item in next) if (item.levelId == levelId) item.stars = stars;
                data.levels = next;
            }
            data.active = null;
            Persist();
        }

        public ProgressPayload Progress() => new ProgressPayload
        {
            levels = data.levels,
            highestUnlocked = HighestUnlocked,
            realm = Realm
        };

        public void Merge(ProgressPayload remote)
        {
            if (remote?.levels == null) return;
            foreach (var result in remote.levels)
                if (result.levelId >= 1 && result.levelId <= LevelCatalog.Count && result.stars >= 1 && result.stars <= 3 &&
                    result.stars > Stars(result.levelId))
                {
                    int previous = Stars(result.levelId);
                    var next = new LevelStar[data.levels.Length + (previous == 0 ? 1 : 0)];
                    Array.Copy(data.levels, next, data.levels.Length);
                    if (previous == 0) next[next.Length - 1] = new LevelStar { levelId = result.levelId, stars = result.stars };
                    else foreach (var item in next) if (item.levelId == result.levelId) item.stars = result.stars;
                    data.levels = next;
                }
            Persist();
        }

        private SaveData Load()
        {
            foreach (string candidate in new[] { path, path + ".bak" })
            {
                if (!File.Exists(candidate)) continue;
                try
                {
                    var loaded = JsonUtility.FromJson<SaveData>(File.ReadAllText(candidate));
                    if (loaded != null) { loaded.levels ??= Array.Empty<LevelStar>(); return loaded; }
                }
                catch (Exception error) { Debug.LogWarning("Cannot read save: " + error.Message); }
            }
            return new SaveData();
        }

        private void Persist()
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(path));
                string temp = path + ".tmp";
                File.WriteAllText(temp, JsonUtility.ToJson(data));
                if (File.Exists(path)) File.Copy(path, path + ".bak", true);
                if (File.Exists(path)) File.Delete(path);
                File.Move(temp, path);
            }
            catch (Exception error) { Debug.LogError("Cannot save progress: " + error.Message); }
        }
    }
}
