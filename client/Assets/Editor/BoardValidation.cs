using System;
using KiemKhaiTienLo.Core;
using UnityEditor;
using UnityEngine;

public static class BoardValidation
{
    [MenuItem("Kiếm Khai/Validate 60 Levels")]
    public static void Validate()
    {
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
        }
        Debug.Log("Validated 60 bundled levels, board snapshots and accepted swaps.");
    }

    private static void Check(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }
}
