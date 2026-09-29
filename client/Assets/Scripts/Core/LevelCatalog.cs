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
        public const int Count = 60;
        private static readonly string[] Chapters =
            { "Vân Hải Tiên Sơn", "Huyền Kiếm Bí Cảnh", "Lôi Hỏa Thiên Môn" };

        public static LevelDefinition Get(int id)
        {
            if (id < 1 || id > Count) throw new ArgumentOutOfRangeException(nameof(id));
            int chapter = (id - 1) / 20;
            int chapterLevel = (id - 1) % 20 + 1;
            bool boss = chapterLevel == 20;
            bool battle = !boss && chapterLevel % 2 == 0;
            bool seal = !boss && !battle && chapterLevel >= 7 && chapterLevel % 4 == 3;
            return new LevelDefinition
            {
                Id = id,
                Chapter = Chapters[chapter],
                Moves = boss ? 22 + chapter * 3 : 18 + chapter * 2 + Math.Min(4, chapterLevel / 5),
                Goal = boss ? GoalKind.Boss : battle ? GoalKind.Battle : seal ? GoalKind.BreakSeals : GoalKind.Collect,
                CollectKind = (TileKind)((id + chapter) % 5),
                Target = boss ? 150 + chapter * 90 : battle ? 75 + chapter * 35 + chapterLevel * 2 :
                    seal ? 2 + chapter : 8 + chapter * 3 + chapterLevel / 5,
                Rocks = chapterLevel < 4 ? 0 : Math.Min(7, chapter + chapterLevel / 5),
                Seals = seal ? 2 + chapter : chapterLevel < 6 ? 0 : Math.Min(4, chapter + 1),
                Seed = 7919 + id * 104729
            };
        }

        public static string RealmForCompleted(int completed)
        {
            return completed >= 40 ? "Kim Đan" : completed >= 20 ? "Trúc Cơ" : "Luyện Khí";
        }
    }
}
