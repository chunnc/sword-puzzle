using KiemKhaiTienLo.App;
using UnityEditor;
using UnityEngine;
using UnityEngine.UIElements;

[InitializeOnLoad]
public static class EditorPlaySmoke
{
    private const string PendingKey = "KiemKhai.EditorPlaySmoke.Pending";
    private const string StartedKey = "KiemKhai.EditorPlaySmoke.Started";

    static EditorPlaySmoke() { EditorApplication.update += Check; }

    public static void Run()
    {
        SessionState.SetBool(PendingKey, true);
        SessionState.SetFloat(StartedKey, (float)EditorApplication.timeSinceStartup);
        EditorApplication.isPlaying = true;
    }

    private static void Check()
    {
        if (!SessionState.GetBool(PendingKey, false)) return;
        if (EditorApplication.isPlaying)
        {
            var game = Object.FindFirstObjectByType<GameApp>();
            var document = game == null ? null : game.GetComponent<UIDocument>();
            if (document != null && document.rootVisualElement.Q<VisualElement>("map") != null)
            {
                SessionState.SetBool(PendingKey, false);
                Debug.Log("Editor play smoke passed: game and world map initialized.");
                EditorApplication.Exit(0);
                return;
            }
        }

        if (EditorApplication.timeSinceStartup - SessionState.GetFloat(StartedKey, 0) <= 30) return;
        SessionState.SetBool(PendingKey, false);
        Debug.LogError("Editor play smoke failed: world map did not initialize within 30 seconds.");
        EditorApplication.Exit(1);
    }
}
