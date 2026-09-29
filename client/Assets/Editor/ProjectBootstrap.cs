using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UIElements;

[InitializeOnLoad]
public static class ProjectBootstrap
{
    static ProjectBootstrap() { EditorApplication.delayCall += EnsureProject; }

    public static void EnsureProject()
    {
        const string panelPath = "Assets/Resources/GamePanel.asset";
        if (AssetDatabase.LoadAssetAtPath<PanelSettings>(panelPath) == null)
        {
            var panel = ScriptableObject.CreateInstance<PanelSettings>();
            panel.scaleMode = PanelScaleMode.ScaleWithScreenSize;
            panel.referenceResolution = new Vector2Int(1080, 1920);
            AssetDatabase.CreateAsset(panel, panelPath);
        }
        const string scenePath = "Assets/Scenes/Main.unity";
        if (!File.Exists(scenePath))
        {
            Directory.CreateDirectory("Assets/Scenes");
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            EditorSceneManager.SaveScene(scene, scenePath);
        }
        EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(scenePath, true) };
        PlayerSettings.productName = "Kiếm Khai Tiên Lộ";
        PlayerSettings.defaultInterfaceOrientation = UIOrientation.Portrait;
        PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel25;
        PlayerSettings.Android.targetSdkVersion = AndroidSdkVersions.AndroidApiLevel35;
        PlayerSettings.iOS.targetOSVersionString = "13.0";
        const string androidPlugin = "Assets/AndroidPlugins/com/kiemkhaitienlo/SecureStore.java";
        var plugin = AssetImporter.GetAtPath(androidPlugin) as PluginImporter;
        if (plugin != null && (plugin.GetCompatibleWithAnyPlatform() ||
            !plugin.GetCompatibleWithPlatform(BuildTarget.Android)))
        {
            plugin.SetCompatibleWithAnyPlatform(false);
            plugin.SetCompatibleWithPlatform(BuildTarget.Android, true);
            plugin.SaveAndReimport();
        }
        EnsureAdMobTestSettings();
        AssetDatabase.SaveAssets();
    }

    private static void EnsureAdMobTestSettings()
    {
        const string path = "Assets/GoogleMobileAds/Resources/GoogleMobileAdsSettings.asset";
        System.Type settingsType = null;
        foreach (var assembly in System.AppDomain.CurrentDomain.GetAssemblies())
        {
            settingsType = assembly.GetType("GoogleMobileAds.Editor.GoogleMobileAdsSettings");
            if (settingsType != null) break;
        }
        if (settingsType == null) return;

        var settings = AssetDatabase.LoadAssetAtPath<ScriptableObject>(path);
        if (settings == null)
        {
            Directory.CreateDirectory("Assets/GoogleMobileAds/Resources");
            settings = ScriptableObject.CreateInstance(settingsType);
            AssetDatabase.CreateAsset(settings, path);
        }

        var serialized = new SerializedObject(settings);
        var androidId = serialized.FindProperty("adMobAndroidAppId");
        var iosId = serialized.FindProperty("adMobIOSAppId");
        if (androidId == null || iosId == null) return;
        if (string.IsNullOrEmpty(androidId.stringValue))
            androidId.stringValue = "ca-app-pub-3940256099942544~3347511713";
        if (string.IsNullOrEmpty(iosId.stringValue))
            iosId.stringValue = "ca-app-pub-3940256099942544~1458002511";
        serialized.ApplyModifiedPropertiesWithoutUndo();
    }

    [MenuItem("Kiếm Khai/Enable AdMob Editor")]
    public static void EnableAdMobEditor()
    {
        var symbols = PlayerSettings.GetScriptingDefineSymbols(NamedBuildTarget.Standalone);
        foreach (var symbol in symbols.Split(';'))
            if (symbol == "SWORD_ADMOB") return;
        PlayerSettings.SetScriptingDefineSymbols(NamedBuildTarget.Standalone,
            string.IsNullOrEmpty(symbols) ? "SWORD_ADMOB" : symbols + ";SWORD_ADMOB");
        Debug.Log("Enabled SWORD_ADMOB for Editor and standalone play.");
    }
}
