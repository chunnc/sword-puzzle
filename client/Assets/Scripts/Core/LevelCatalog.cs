using System;

namespace KiemKhaiTienLo.Core
{
    public enum TileKind { Sword, Fire, Lightning, Stone, Herb, Rock }
    public enum SpecialKind { None, Slash, Omni }
    public enum GoalKind { Collect, BreakSeals, Battle, Boss }

    [Serializable]
    public struct Tile
    {
        public TileKind Kind;
        public SpecialKind Special;
        public bool Locked;
    }

    public sealed class LevelDefinition
    {
        public int Id;
        public int Moves;
        public GoalKind Goal;
        public TileKind CollectKind;
        public int Target;
        public int Rocks;
        public int Seals;
        public int Seed;
        public string Chapter;
    }

    public static class LevelCatalog
    {
        public const int Count = 3;

        public static LevelDefinition Get(int id)
        {
            if (id < 1 || id > Count) throw new ArgumentOutOfRangeException(nameof(id));
            return new LevelDefinition
            {
                Id = id,
                Chapter = "Vân Hải Tiên Sơn",
                Moves = id == 3 ? 24 : 20,
                Goal = id == 3 ? GoalKind.Boss : id == 2 ? GoalKind.Battle : GoalKind.Collect,
                CollectKind = TileKind.Herb,
                Target = id == 3 ? 144 : id == 2 ? 72 : 6,
                Rocks = id == 3 ? 2 : id == 2 ? 1 : 0,
                Seals = id == 3 ? 2 : 0,
                Seed = 7919 + id * 104729
            };
        }

        public static string RealmForCompleted(int completed)
        {
            return completed >= Count ? "Trúc Cơ" : "Luyện Khí";
        }
    }
}
