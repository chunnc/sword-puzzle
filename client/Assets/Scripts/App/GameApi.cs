using System;
using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace KiemKhaiTienLo.App
{
    [Serializable] public sealed class Credentials { public string email; public string password; }
    [Serializable] public sealed class RefreshRequest { public string refreshToken; }
    [Serializable] public sealed class IntentRequest { public int levelId; public string placement = "extra_moves"; }
    [Serializable] public sealed class IntentResponse { public string intentId; public string customData; public long expiresAt; }
    [Serializable] public sealed class IntentStatus { public string status; public int levelId; }
    [Serializable] public sealed class BootstrapResponse
    {
        public int contentVersion = 1;
        public int levelCount = 60;
        public bool rewardedAdsEnabled;
        public string minClientVersion;
    }
    [Serializable] public sealed class ApiErrorResponse { public string error; }

    public sealed class GameApi : MonoBehaviour
    {
        private string baseUrl;
        private SessionData session;
        public bool Configured => !string.IsNullOrEmpty(baseUrl) && !baseUrl.Contains("YOUR_PROJECT");
        public bool Online => Configured && Application.internetReachability != NetworkReachability.NotReachable;
        public bool RewardedAdsEnabled { get; private set; }
        public bool HasBootstrap { get; private set; }
        public SessionData Session => session;

        private void Awake()
        {
            TextAsset asset = Resources.Load<TextAsset>("api-url");
            baseUrl = asset == null ? "" : asset.text.Trim().TrimEnd('/');
            session = SecureSessionStore.Load();
        }

        public IEnumerator Bootstrap(Action onFinished)
        {
            if (!Online) { onFinished?.Invoke(); yield break; }
            yield return Request("GET", "/v1/bootstrap", null, false, (text, error) =>
            {
                if (error == null)
                {
                    var data = JsonUtility.FromJson<BootstrapResponse>(text);
                    RewardedAdsEnabled = data != null && data.rewardedAdsEnabled;
                    HasBootstrap = data != null;
                }
                onFinished?.Invoke();
            });
        }

        public IEnumerator EnsureGuest(Action<string> onFinished)
        {
            if (session != null) { onFinished?.Invoke(null); yield break; }
            if (!Online) { onFinished?.Invoke("OFFLINE"); yield break; }
            yield return Request("POST", "/v1/auth/guest", "{}", false, (text, error) =>
            {
                if (error == null) SetSession(text);
                onFinished?.Invoke(error);
            });
        }

        public IEnumerator Register(string email, string password, Action<string> onFinished)
        {
            if (!Online) { onFinished?.Invoke("OFFLINE"); yield break; }
            string body = JsonUtility.ToJson(new Credentials { email = email, password = password });
            yield return (session != null ? RequestAuthorized("POST", "/v1/auth/register", body, (text, error) =>
            {
                if (error == null) SetSession(text);
                onFinished?.Invoke(error);
            }) : Request("POST", "/v1/auth/register", body, false, (text, error) =>
            {
                if (error == null) SetSession(text);
                onFinished?.Invoke(error);
            }));
        }

        public IEnumerator Login(string email, string password, Action<string> onFinished)
        {
            if (!Online) { onFinished?.Invoke("OFFLINE"); yield break; }
            string body = JsonUtility.ToJson(new Credentials { email = email, password = password });
            yield return (session != null && session.isGuest ?
                RequestAuthorized("POST", "/v1/auth/login", body, (text, error) =>
                {
                    if (error == null) SetSession(text);
                    onFinished?.Invoke(error);
                }) : Request("POST", "/v1/auth/login", body, false, (text, error) =>
            {
                if (error == null) SetSession(text);
                onFinished?.Invoke(error);
            }));
        }

        public IEnumerator Sync(LocalSave save, Action<string> onFinished)
        {
            if (!Online) { onFinished?.Invoke("OFFLINE"); yield break; }
            if (session == null)
            {
                string guestError = null;
                yield return EnsureGuest(error => guestError = error);
                if (guestError != null) { onFinished?.Invoke(guestError); yield break; }
            }
            string result = null, failure = null;
            yield return RequestAuthorized("PUT", "/v1/progress", JsonUtility.ToJson(save.Progress()),
                (text, error) => { result = text; failure = error; });
            if (failure == null)
            {
                save.Merge(JsonUtility.FromJson<ProgressPayload>(result));
            }
            onFinished?.Invoke(failure);
        }

        public IEnumerator CreateAdIntent(int levelId, Action<IntentResponse, string> onFinished)
        {
            if (!Online || !RewardedAdsEnabled || session == null)
            {
                onFinished?.Invoke(null, "ADS_UNAVAILABLE"); yield break;
            }
            yield return RequestAuthorized("POST", "/v1/ads/intents",
                JsonUtility.ToJson(new IntentRequest { levelId = levelId }), (text, error) =>
                onFinished?.Invoke(error == null ? JsonUtility.FromJson<IntentResponse>(text) : null, error));
        }

        public IEnumerator CheckAdIntent(string intentId, Action<IntentStatus, string> onFinished)
        {
            yield return RequestAuthorized("GET", "/v1/ads/intents/" + UnityWebRequest.EscapeURL(intentId), null,
                (text, error) => onFinished?.Invoke(error == null ? JsonUtility.FromJson<IntentStatus>(text) : null, error));
        }

        private void SetSession(string json)
        {
            session = JsonUtility.FromJson<SessionData>(json);
            if (session != null) SecureSessionStore.Save(session);
        }

        private IEnumerator RequestAuthorized(string method, string path, string body, Action<string, string> callback)
        {
            if (session == null) { callback?.Invoke(null, "AUTH_REQUIRED"); yield break; }
            string response = null, error = null;
            yield return Request(method, path, body, true, (text, failure) => { response = text; error = failure; });
            if (error == "INVALID_SESSION")
            {
                string refresh = null;
                yield return Request("POST", "/v1/auth/refresh",
                    JsonUtility.ToJson(new RefreshRequest { refreshToken = session.refreshToken }), false,
                    (text, failure) => { refresh = text; error = failure; });
                if (error == null)
                {
                    SetSession(refresh);
                    yield return Request(method, path, body, true,
                        (text, failure) => { response = text; error = failure; });
                }
            }
            callback?.Invoke(response, error);
        }

        private IEnumerator Request(string method, string path, string body, bool authorize,
            Action<string, string> callback)
        {
            if (!Online) { callback?.Invoke(null, "OFFLINE"); yield break; }
            using (var request = new UnityWebRequest(baseUrl + path, method))
            {
                request.downloadHandler = new DownloadHandlerBuffer();
                request.timeout = 12;
                if (body != null)
                {
                    request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body));
                    request.SetRequestHeader("Content-Type", "application/json");
                }
                if (authorize && session != null) request.SetRequestHeader("Authorization", "Bearer " + session.idToken);
                yield return request.SendWebRequest();
                string text = request.downloadHandler?.text;
                if (request.result == UnityWebRequest.Result.Success)
                    callback?.Invoke(text, null);
                else
                {
                    string code = "NETWORK_ERROR";
                    if (!string.IsNullOrEmpty(text))
                    {
                        try { code = JsonUtility.FromJson<ApiErrorResponse>(text)?.error ?? code; }
                        catch { /* Keep generic error. */ }
                    }
                    callback?.Invoke(null, code);
                }
            }
        }
    }
}
