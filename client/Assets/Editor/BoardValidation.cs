using System;
using KiemKhaiTienLo.Core;
using UnityEditor;
using UnityEngine;

public static class BoardValidation
{
    [MenuItem("Kiếm Khai/Validate 3 Levels")]
    public static void Validate()
    {
        Check(LevelCatalog.Count == 3, "Prototype must contain exactly three levels");
        Check(LevelCatalog.Get(1).Goal == GoalKind.Collect &&
              LevelCatalog.Get(2).Goal == GoalKind.Battle &&
              LevelCatalog.Get(3).Goal == GoalKind.Boss, "Prototype goals differ from the three-screen flow");
        Check(LevelCatalog.RealmForCompleted(3) == "Trúc Cơ", "Third level must unlock Trúc Cơ");
        bool rejectedFourth = false;
        try { LevelCatalog.Get(4); }
        catch (ArgumentOutOfRangeException) { rejectedFourth = true; }
        Check(rejectedFourth, "Level four is still playable");
        var random = new System.Random(4401);
        for (int id = 1; id <= LevelCatalog.Count; id++)
        {
            var level = LevelCatalog.Get(id);
            var board = new BoardEngine(level);
            var restored = new BoardEngine(level, board.Snapshot());
            for (int y = 0; y < BoardEngine.Height; y++)
                for (int x = 0; x < BoardEngine.Width; x++)
                    Check(board.Get(x, y).Kind == restored.Get(x, y).Kind, $"Restore differs on level {id}");

            int accepted = 0;
            for (int attempt = 0; attempt < 300 && !board.Won && !board.Lost; attempt++)
            {
                int x = random.Next(BoardEngine.Width), y = random.Next(BoardEngine.Height);
                int nx = x + (random.Next(2) == 0 ? 1 : 0);
                int ny = y + (nx == x ? 1 : 0);
                if (nx >= BoardEngine.Width || ny >= BoardEngine.Height) continue;
                int before = board.Moves;
                if (!board.TrySwap(x, y, nx, ny)) continue;
                accepted++;
                Check(board.Moves == before - 1, $"Accepted swap did not cost one move on level {id}");
                Check(board.Remaining >= 0, $"Negative objective on level {id}");
                for (int yy = 0; yy < BoardEngine.Height; yy++)
                    for (int xx = 0; xx < BoardEngine.Width; xx++)
                        Check((int)board.Get(xx, yy).Kind >= 0 && (int)board.Get(xx, yy).Kind <= 5,
                            $"Invalid tile on level {id}");
            }
            Check(accepted > 0, $"No valid swap on level {id}");
            Check(CanWin(level), $"Test level {id} is not winnable with a greedy playthrough");
        }
        Debug.Log("Validated three bundled levels, board snapshots and accepted swaps.");
    }

    private static bool CanWin(LevelDefinition level)
    {
        var board = new BoardEngine(level);
        for (int turn = 0; turn < level.Moves + 2 && !board.Won && !board.Lost; turn++)
        {
            if (board.SwordQi >= 100) board.UseSwordQi(3);
            if (board.Won) break;
            var snapshot = board.Snapshot();
            int bestX = -1, bestY = -1, bestNX = -1, bestNY = -1;
            float best = float.MinValue;
            for (int y = 0; y < BoardEngine.Height; y++)
                for (int x = 0; x < BoardEngine.Width; x++)
                    foreach (var direction in new[] { new Vector2Int(1, 0), new Vector2Int(0, 1) })
                    {
                        int nx = x + direction.x, ny = y + direction.y;
                        if (nx >= BoardEngine.Width || ny >= BoardEngine.Height) continue;
                        var candidate = new BoardEngine(level, snapshot);
                        if (!candidate.TrySwap(x, y, nx, ny)) continue;
                        float gain = (board.Remaining - candidate.Remaining) * 100f +
                            (candidate.Score - board.Score) + candidate.SwordQi * .1f;
                        if (gain <= best) continue;
                        best = gain; bestX = x; bestY = y; bestNX = nx; bestNY = ny;
                    }
            if (bestX < 0 || !board.TrySwap(bestX, bestY, bestNX, bestNY)) break;
        }
        return board.Won;
    }

    private static void Check(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }
}
