using System;
using System.Collections.Generic;

namespace KiemKhaiTienLo.Core
{
    [Serializable]
    public sealed class BoardSnapshot
    {
        public int LevelId;
        public int Moves;
        public int Remaining;
        public int SwordQi;
        public int Score;
        public int Drops;
        public int RandomState;
        public bool ExtraMovesUsed;
        public Tile[] Tiles;
    }

    public sealed class BoardEngine
    {
        public const int Width = 7;
        public const int Height = 7;
        private readonly LevelDefinition level;
        private readonly Tile[,] tiles = new Tile[Width, Height];
        private uint randomState;
        private int drops;

        public int Moves { get; private set; }
        public int Remaining { get; private set; }
        public int SwordQi { get; private set; }
        public int Score { get; private set; }
        public bool ExtraMovesUsed { get; private set; }
        public bool Won => Remaining <= 0;
        public bool Lost => Moves <= 0 && !Won;
        public LevelDefinition Level => level;

        public BoardEngine(LevelDefinition definition, BoardSnapshot restore = null)
        {
            level = definition;
            randomState = (uint)definition.Seed;
            if (restore != null && restore.LevelId == definition.Id && restore.Tiles != null &&
                restore.Tiles.Length == Width * Height)
            {
                Moves = restore.Moves;
                Remaining = restore.Remaining;
                SwordQi = restore.SwordQi;
                Score = restore.Score;
                ExtraMovesUsed = restore.ExtraMovesUsed;
                drops = restore.Drops;
                randomState = restore.RandomState == 0 ? (uint)definition.Seed : (uint)restore.RandomState;
                for (int y = 0; y < Height; y++)
                    for (int x = 0; x < Width; x++) tiles[x, y] = restore.Tiles[y * Width + x];
                return;
            }
            Moves = definition.Moves;
            Remaining = definition.Target;
            FillInitial();
            PlaceObstacles(definition.Rocks, definition.Seals);
            EnsureMove();
        }

        public Tile Get(int x, int y) => tiles[x, y];

        public BoardSnapshot Snapshot()
        {
            var flat = new Tile[Width * Height];
            for (int y = 0; y < Height; y++)
                for (int x = 0; x < Width; x++) flat[y * Width + x] = tiles[x, y];
            return new BoardSnapshot { LevelId = level.Id, Moves = Moves, Remaining = Remaining,
                SwordQi = SwordQi, Score = Score, Drops = drops, RandomState = (int)randomState,
                ExtraMovesUsed = ExtraMovesUsed, Tiles = flat };
        }

        public bool TrySwap(int x1, int y1, int x2, int y2)
        {
            if (Won || Lost || !Inside(x1, y1) || !Inside(x2, y2) ||
                Math.Abs(x1 - x2) + Math.Abs(y1 - y2) != 1 ||
                tiles[x1, y1].Kind == TileKind.Rock || tiles[x2, y2].Kind == TileKind.Rock ||
                tiles[x1, y1].Locked || tiles[x2, y2].Locked) return false;

            Tile first = tiles[x1, y1];
            Tile second = tiles[x2, y2];
            tiles[x1, y1] = second;
            tiles[x2, y2] = first;
            var matched = FindMatches();
            if (first.Special == SpecialKind.Omni || second.Special == SpecialKind.Omni)
            {
                TileKind target = first.Special == SpecialKind.Omni ? second.Kind : first.Kind;
                for (int y = 0; y < Height; y++)
                    for (int x = 0; x < Width; x++)
                        if (tiles[x, y].Kind == target && target != TileKind.Rock) matched.Add(y * Width + x);
                matched.Add(y1 * Width + x1);
                matched.Add(y2 * Width + x2);
            }
            else if (first.Special == SpecialKind.Slash || second.Special == SpecialKind.Slash)
            {
                for (int x = 0; x < Width; x++) matched.Add(y2 * Width + x);
            }
            if (matched.Count == 0)
            {
                tiles[x1, y1] = first;
                tiles[x2, y2] = second;
                return false;
            }

            Moves--;
            // Promote the swapped cell that actually formed a line of four or five.
            int specialX = x2, specialY = y2;
            int specialCount = CountMatchingLine(x2, y2);
            if (CountMatchingLine(x1, y1) > specialCount)
            { specialX = x1; specialY = y1; specialCount = CountMatchingLine(x1, y1); }
            SpecialKind created = specialCount >= 5 ? SpecialKind.Omni :
                specialCount >= 4 ? SpecialKind.Slash : SpecialKind.None;
            if (created != SpecialKind.None && tiles[specialX, specialY].Kind != TileKind.Rock)
            {
                matched.Remove(specialY * Width + specialX);
                var promoted = tiles[specialX, specialY];
                promoted.Special = created;
                tiles[specialX, specialY] = promoted;
            }
            Resolve(matched);
            return true;
        }

        public bool UseSwordQi(int row)
        {
            if (Won || Lost || SwordQi < 100 || row < 0 || row >= Height) return false;
            SwordQi = 0;
            var matched = new HashSet<int>();
            for (int x = 0; x < Width; x++) matched.Add(row * Width + x);
            Resolve(matched);
            return true;
        }

        public bool GrantExtraMoves()
        {
            if (!Lost || ExtraMovesUsed) return false;
            Moves += 3;
            ExtraMovesUsed = true;
            return true;
        }

        private void Resolve(HashSet<int> matched)
        {
            int chain = 0;
            while (matched.Count > 0 && chain < 20)
            {
                chain++;
                var clear = new HashSet<int>(matched);
                foreach (int index in matched)
                {
                    int x = index % Width, y = index / Width;
                    var tile = tiles[x, y];
                    if (tile.Special == SpecialKind.Slash)
                        for (int xx = 0; xx < Width; xx++) clear.Add(y * Width + xx);
                    else if (tile.Special == SpecialKind.Omni)
                        for (int yy = 0; yy < Height; yy++) clear.Add(yy * Width + x);
                }
                int removed = 0;
                foreach (int index in clear)
                {
                    int x = index % Width, y = index / Width;
                    Tile tile = tiles[x, y];
                    if (tile.Kind == TileKind.Rock) continue;
                    if (tile.Locked)
                    {
                        tile.Locked = false;
                        if (level.Goal == GoalKind.BreakSeals) Remaining = Math.Max(0, Remaining - 1);
                        tiles[x, y] = tile;
                    }
                    else
                    {
                        removed++;
                        if (tile.Kind == TileKind.Sword) SwordQi = Math.Min(100, SwordQi + 6);
                        if (level.Goal == GoalKind.Collect && tile.Kind == level.CollectKind)
                            Remaining = Math.Max(0, Remaining - 1);
                        tiles[x, y] = Cleared();
                    }
                    WeakenAdjacent(x, y);
                }
                if (level.Goal == GoalKind.Boss || level.Goal == GoalKind.Battle)
                    Remaining = Math.Max(0, Remaining - removed * (chain == 1 ? 6 : 8));
                Score += removed * 10 * chain;
                Refill();
                matched = FindMatches();
            }
            if (!Won && !Lost) EnsureMove();
        }

        private void WeakenAdjacent(int x, int y)
        {
            int[] dx = { -1, 1, 0, 0 }, dy = { 0, 0, -1, 1 };
            for (int i = 0; i < 4; i++)
            {
                int nx = x + dx[i], ny = y + dy[i];
                if (!Inside(nx, ny)) continue;
                Tile nearby = tiles[nx, ny];
                if (nearby.Kind == TileKind.Rock && nearby.Special != (SpecialKind)99)
                {
                    nearby.Kind = NextKind();
                    tiles[nx, ny] = nearby;
                }
                else if (nearby.Locked)
                {
                    nearby.Locked = false;
                    tiles[nx, ny] = nearby;
                    if (level.Goal == GoalKind.BreakSeals) Remaining = Math.Max(0, Remaining - 1);
                }
            }
        }

        private void Refill()
        {
            for (int x = 0; x < Width; x++)
            {
                int start = 0;
                for (int boundary = 0; boundary <= Height; boundary++)
                {
                    bool barrier = boundary == Height ||
                        (tiles[x, boundary].Kind == TileKind.Rock && !IsCleared(x, boundary)) ||
                        tiles[x, boundary].Locked;
                    if (!barrier) continue;
                    int write = start;
                    for (int y = start; y < boundary; y++)
                    {
                        if (IsCleared(x, y)) continue;
                        tiles[x, write++] = tiles[x, y];
                    }
                    for (int y = write; y < boundary; y++) tiles[x, y] = new Tile { Kind = NextKind() };
                    start = boundary + 1;
                }
            }
        }

        // Cleared cells use Rock plus a sentinel special value until gravity finishes.
        private static Tile Cleared() => new Tile { Kind = TileKind.Rock, Special = (SpecialKind)99 };
        private bool IsCleared(int x, int y) => tiles[x, y].Kind == TileKind.Rock && tiles[x, y].Special == (SpecialKind)99;
        private int NextIndex(int exclusiveMax)
        {
            randomState ^= randomState << 13;
            randomState ^= randomState >> 17;
            randomState ^= randomState << 5;
            return (int)(randomState % (uint)exclusiveMax);
        }
        private TileKind NextKind() { drops++; return (TileKind)NextIndex(5); }
        private static bool Inside(int x, int y) => x >= 0 && x < Width && y >= 0 && y < Height;

        private void FillInitial()
        {
            for (int y = 0; y < Height; y++)
                for (int x = 0; x < Width; x++)
                {
                    TileKind kind;
                    do { kind = NextKind(); }
                    while ((x >= 2 && tiles[x - 1, y].Kind == kind && tiles[x - 2, y].Kind == kind) ||
                           (y >= 2 && tiles[x, y - 1].Kind == kind && tiles[x, y - 2].Kind == kind));
                    tiles[x, y] = new Tile { Kind = kind };
                }
        }

        private void PlaceObstacles(int rocks, int seals)
        {
            for (int i = 0; i < rocks; i++)
            {
                int x = NextIndex(Width), y = 1 + NextIndex(Height - 2);
                if (tiles[x, y].Kind == TileKind.Rock) { i--; continue; }
                tiles[x, y] = new Tile { Kind = TileKind.Rock };
            }
            for (int i = 0; i < seals; i++)
            {
                int x = NextIndex(Width), y = NextIndex(Height);
                if (tiles[x, y].Kind == TileKind.Rock || tiles[x, y].Locked) { i--; continue; }
                Tile tile = tiles[x, y]; tile.Locked = true; tiles[x, y] = tile;
            }
        }

        private int CountMatchingLine(int x, int y)
        {
            TileKind kind = tiles[x, y].Kind;
            int horizontal = 1, vertical = 1;
            for (int xx = x - 1; xx >= 0 && tiles[xx, y].Kind == kind; xx--) horizontal++;
            for (int xx = x + 1; xx < Width && tiles[xx, y].Kind == kind; xx++) horizontal++;
            for (int yy = y - 1; yy >= 0 && tiles[x, yy].Kind == kind; yy--) vertical++;
            for (int yy = y + 1; yy < Height && tiles[x, yy].Kind == kind; yy++) vertical++;
            return Math.Max(horizontal, vertical);
        }

        private HashSet<int> FindMatches()
        {
            var matches = new HashSet<int>();
            for (int y = 0; y < Height; y++)
                for (int x = 0; x < Width; x++)
                {
                    TileKind kind = tiles[x, y].Kind;
                    if (kind == TileKind.Rock) continue;
                    if (x <= Width - 3 && tiles[x + 1, y].Kind == kind && tiles[x + 2, y].Kind == kind)
                        for (int xx = x; xx < Width && tiles[xx, y].Kind == kind; xx++) matches.Add(y * Width + xx);
                    if (y <= Height - 3 && tiles[x, y + 1].Kind == kind && tiles[x, y + 2].Kind == kind)
                        for (int yy = y; yy < Height && tiles[x, yy].Kind == kind; yy++) matches.Add(yy * Width + x);
                }
            return matches;
        }

        private bool HasMove()
        {
            for (int y = 0; y < Height; y++)
                for (int x = 0; x < Width; x++)
                {
                    if (tiles[x, y].Kind == TileKind.Rock || tiles[x, y].Locked) continue;
                    for (int direction = 0; direction < 2; direction++)
                    {
                        int nx = x + (direction == 0 ? 1 : 0), ny = y + (direction == 1 ? 1 : 0);
                        if (!Inside(nx, ny) || tiles[nx, ny].Kind == TileKind.Rock || tiles[nx, ny].Locked) continue;
                        if (tiles[x, y].Special != SpecialKind.None || tiles[nx, ny].Special != SpecialKind.None) return true;
                        Tile one = tiles[x, y], two = tiles[nx, ny];
                        tiles[x, y] = two; tiles[nx, ny] = one;
                        bool matches = FindMatches().Count > 0;
                        tiles[x, y] = one; tiles[nx, ny] = two;
                        if (matches) return true;
                    }
                }
            return false;
        }

        private void EnsureMove()
        {
            if (HasMove()) return;
            var positions = new List<int>();
            var kinds = new List<TileKind>();
            for (int y = 0; y < Height; y++)
                for (int x = 0; x < Width; x++)
                    if (tiles[x, y].Kind != TileKind.Rock && !tiles[x, y].Locked)
                    { positions.Add(y * Width + x); kinds.Add(tiles[x, y].Kind); }
            for (int attempt = 0; attempt < 40; attempt++)
            {
                for (int i = kinds.Count - 1; i > 0; i--)
                {
                    int j = NextIndex(i + 1);
                    TileKind swapped = kinds[i]; kinds[i] = kinds[j]; kinds[j] = swapped;
                }
                for (int i = 0; i < positions.Count; i++)
                {
                    int x = positions[i] % Width, y = positions[i] / Width;
                    var tile = tiles[x, y]; tile.Kind = kinds[i]; tiles[x, y] = tile;
                }
                if (FindMatches().Count == 0 && HasMove()) return;
            }
        }
    }
}
