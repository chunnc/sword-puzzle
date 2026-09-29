using System;
using System.Runtime.InteropServices;
using UnityEngine;

namespace KiemKhaiTienLo.App
{
    [Serializable]
    public sealed class SessionData
    {
        public string uid;
        public string idToken;
        public string refreshToken;
        public int expiresIn;
        public bool isGuest;
        public long acquiredAt;
    }

    public static class SecureSessionStore
    {
        private const string Key = "kiem-khai-session";
#if UNITY_IOS && !UNITY_EDITOR
        [DllImport("__Internal")] private static extern void KKSecureSave(string key, string value);
        [DllImport("__Internal")] private static extern IntPtr KKSecureLoad(string key);
        [DllImport("__Internal")] private static extern void KKSecureDelete(string key);
        [DllImport("__Internal")] private static extern void KKSecureFree(IntPtr pointer);
#endif

        public static SessionData Load()
        {
            string raw = "";
            try
            {
#if UNITY_IOS && !UNITY_EDITOR
                IntPtr pointer = KKSecureLoad(Key);
                if (pointer != IntPtr.Zero) { raw = Marshal.PtrToStringAnsi(pointer); KKSecureFree(pointer); }
#elif UNITY_ANDROID && !UNITY_EDITOR
                using (var secure = new AndroidJavaClass("com.kiemkhaitienlo.SecureStore"))
                    raw = secure.CallStatic<string>("load", Key);
#else
                raw = PlayerPrefs.GetString(Key, ""); // Editor-only fallback.
#endif
                return string.IsNullOrEmpty(raw) ? null : JsonUtility.FromJson<SessionData>(raw);
            }
            catch (Exception error) { Debug.LogWarning("Secure session unavailable: " + error.Message); return null; }
        }

        public static void Save(SessionData session)
        {
            session.acquiredAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            string raw = JsonUtility.ToJson(session);
            try
            {
#if UNITY_IOS && !UNITY_EDITOR
                KKSecureSave(Key, raw);
#elif UNITY_ANDROID && !UNITY_EDITOR
                using (var secure = new AndroidJavaClass("com.kiemkhaitienlo.SecureStore"))
                    secure.CallStatic("save", Key, raw);
#else
                PlayerPrefs.SetString(Key, raw); PlayerPrefs.Save();
#endif
            }
            catch (Exception error) { Debug.LogWarning("Cannot persist session: " + error.Message); }
        }

        public static void Clear()
        {
            try
            {
#if UNITY_IOS && !UNITY_EDITOR
                KKSecureDelete(Key);
#elif UNITY_ANDROID && !UNITY_EDITOR
                using (var secure = new AndroidJavaClass("com.kiemkhaitienlo.SecureStore"))
                    secure.CallStatic("delete", Key);
#else
                PlayerPrefs.DeleteKey(Key); PlayerPrefs.Save();
#endif
            }
            catch (Exception error) { Debug.LogWarning("Cannot clear session: " + error.Message); }
        }
    }
}
