using System.Reflection;
using KiemKhaiTienLo.App;
using KiemKhaiTienLo.Core;
using UnityEditor;
using UnityEngine;

// Editor-only art review. These commands do not change saves or unlock levels.
public static class UIPreview
{
    private const BindingFlags PrivateInstance = BindingFlags.Instance | BindingFlags.NonPublic;

    [MenuItem("Kiếm Khai/Preview/Map")]
    public static void Map() => Invoke("RenderMap");

    [MenuItem("Kiếm Khai/Preview/Exploration")]
    public static void Exploration() => Level(1);

    [MenuItem("Kiếm Khai/Preview/Battle")]
    public static void Battle() => Level(2);

    [MenuItem("Kiếm Khai/Preview/Boss")]
    public static void Boss() => Level(3);

    [MenuItem("Kiếm Khai/Preview/Breakthrough")]
    public static void Breakthrough() => Invoke("RenderRealm");

    private static void Level(int id)
    {
        var app = Object.FindFirstObjectByType<GameApp>();
        if (!EditorApplication.isPlaying || app == null)
        { Debug.LogWarning("Enter Play Mode to preview the UI."); return; }
        typeof(GameApp).GetField("board", PrivateInstance)?.SetValue(app,
            new BoardEngine(LevelCatalog.Get(id)));
        Invoke("RenderGame");
    }

    private static void Invoke(string name)
    {
        var app = Object.FindFirstObjectByType<GameApp>();
        if (!EditorApplication.isPlaying || app == null)
        { Debug.LogWarning("Enter Play Mode to preview the UI."); return; }
        typeof(GameApp).GetMethod(name, PrivateInstance)?.Invoke(app, null);
    }
}
