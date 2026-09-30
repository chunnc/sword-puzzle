using System;
using System.IO;
using System.Reflection;
using UnityEditor;
using UnityEngine;

// Captures deterministic preview states without changing LocalSave or unlocking levels.
public static class UICapture
{
    private static readonly (string name, Action show)[] Screens =
    {
        ("map", UIPreview.Map),
        ("exploration", UIPreview.Exploration),
        ("battle", UIPreview.Battle),
        ("boss", UIPreview.Boss),
        ("breakthrough", UIPreview.Breakthrough),
        ("win", UIPreview.Win),
        ("loss", UIPreview.Loss),
        ("account", UIPreview.Account)
    };

    private static readonly Vector2Int[] Sizes =
    {
        new Vector2Int(1080, 1920),
        new Vector2Int(1080, 2340)
    };

    private static int sizeIndex, screenIndex, phase, ticks, attempts;
    private static EditorWindow gameView;
    private static PropertyInfo selectedSizeIndex;
    private static MethodInfo setCustomResolution;
    private static int previousSizeIndex;
    private static string pendingPath, finalPath;

    [MenuItem("Kiếm Khai/Capture UI Screens")]
    public static void CaptureAll()
    {
        if (!EditorApplication.isPlaying)
        {
            Debug.LogWarning("Enter Play Mode before capturing the UI.");
            return;
        }
        EditorApplication.update -= Tick;
        var type = typeof(Editor).Assembly.GetType("UnityEditor.GameView");
        if (type == null) { Debug.LogError("Unity Game View type is unavailable."); return; }
        gameView = EditorWindow.GetWindow(type);
        selectedSizeIndex = type.GetProperty("selectedSizeIndex",
            BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
        setCustomResolution = type.GetMethod("SetCustomResolution",
            BindingFlags.Instance | BindingFlags.NonPublic);
        if (selectedSizeIndex == null || setCustomResolution == null)
        { Debug.LogError("Unity Game View resolution API is unavailable."); return; }
        previousSizeIndex = (int)selectedSizeIndex.GetValue(gameView);
        sizeIndex = screenIndex = phase = ticks = attempts = 0;
        pendingPath = null;
        SetSize(Sizes[0]);
        EditorApplication.update += Tick;
    }

    private static void SetSize(Vector2Int size)
    {
        setCustomResolution.Invoke(gameView, new object[] {
            new Vector2(size.x, size.y), "Codex UI Capture" });
        gameView.Repaint();
    }

    private static void Tick()
    {
        if (!EditorApplication.isPlaying) { Finish(false, "Play Mode ended during capture."); return; }
        ticks++;
        if (phase == 0)
        {
            // The Editor's Screen.width can report the host view size while a
            // fixed-resolution Game View is scaled to fit the window.
            if (ticks < 90) return;
            Screens[screenIndex].show();
            phase = 1;
            ticks = 0;
            return;
        }
        if (phase == 1 && ticks >= 15)
        {
            var size = Sizes[sizeIndex];
            string directory = Path.GetFullPath(Path.Combine(Application.dataPath,
                "../../assets/ui-review/after", $"{size.x}x{size.y}"));
            Directory.CreateDirectory(directory);
            finalPath = Path.Combine(directory, Screens[screenIndex].name + ".png");
            pendingPath = Path.Combine(directory, Screens[screenIndex].name + ".pending.png");
            if (File.Exists(pendingPath)) File.Delete(pendingPath);
            ScreenCapture.CaptureScreenshot(pendingPath);
            phase = 2;
            ticks = 0;
            return;
        }
        if (phase != 2) return;
        if (File.Exists(pendingPath) && new FileInfo(pendingPath).Length >= 24)
        {
            // A blank frame can be captured while Game View recreates its
            // render target. Its PNG is tiny compared with these painted scenes.
            if (!HasExpectedSize(pendingPath, Sizes[sizeIndex]) ||
                new FileInfo(pendingPath).Length < 100000)
            {
                if (ticks < 90) return;
                if (++attempts >= 3)
                { Finish(false, "Could not capture a rendered frame: " + pendingPath); return; }
                File.Delete(pendingPath);
                phase = 1;
                ticks = 0;
                return;
            }
            if (File.Exists(finalPath)) File.Delete(finalPath);
            File.Move(pendingPath, finalPath);
            attempts = 0;
            screenIndex++;
            if (screenIndex == Screens.Length)
            {
                screenIndex = 0;
                sizeIndex++;
                if (sizeIndex == Sizes.Length)
                { Finish(true, "Captured all UI review screens."); return; }
                SetSize(Sizes[sizeIndex]);
            }
            phase = 0;
            ticks = 0;
        }
        else if (ticks > 600) Finish(false, "Timed out waiting for " + pendingPath);
    }

    private static bool HasExpectedSize(string path, Vector2Int expected)
    {
        using (var file = File.OpenRead(path))
        {
            if (file.Length < 24) return false;
            file.Position = 16;
            byte[] dimensions = new byte[8];
            if (file.Read(dimensions, 0, 8) != 8) return false;
            int width = dimensions[0] << 24 | dimensions[1] << 16 |
                        dimensions[2] << 8 | dimensions[3];
            int height = dimensions[4] << 24 | dimensions[5] << 16 |
                         dimensions[6] << 8 | dimensions[7];
            return width == expected.x && height == expected.y;
        }
    }

    private static void Finish(bool success, string message)
    {
        EditorApplication.update -= Tick;
        if (gameView != null && selectedSizeIndex != null)
        {
            selectedSizeIndex.SetValue(gameView, previousSizeIndex);
            gameView.Repaint();
        }
        if (success) Debug.Log(message);
        else Debug.LogError(message);
    }
}
