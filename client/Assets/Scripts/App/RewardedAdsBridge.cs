using System;
using System.Threading;
using UnityEngine;
#if SWORD_ADMOB
using GoogleMobileAds.Api;
using GoogleMobileAds.Common;
#endif

namespace KiemKhaiTienLo.App
{
    public sealed class RewardedAdsBridge : MonoBehaviour
    {
        private string adUnitId;
        private bool started;
#if SWORD_ADMOB
        private RewardedAd ad;
#endif
        public bool Ready
        {
            get
            {
#if SWORD_ADMOB
                return ad != null && ad.CanShowAd();
#else
                return false;
#endif
            }
        }

        public void Activate()
        {
            if (started || Application.internetReachability == NetworkReachability.NotReachable) return;
#if SWORD_ADMOB
#if UNITY_IOS
            string resource = "admob-ios-id";
#else
            string resource = "admob-android-id";
#endif
            var id = Resources.Load<TextAsset>(resource);
            adUnitId = id == null ? "" : id.text.Trim();
            if (adUnitId.Length == 0 || adUnitId.Contains("YOUR_")) return;
            started = true;
            MobileAds.Initialize(_ => MobileAdsEventExecutor.ExecuteInUpdate(Load));
#endif
        }

        public void Show(string customData, Action<bool> onFinished)
        {
#if SWORD_ADMOB
            if (!Ready) { onFinished?.Invoke(false); return; }
            var current = ad;
            ad = null;
            current.SetServerSideVerificationOptions(new ServerSideVerificationOptions
            {
                CustomData = customData
            });
            int rewarded = 0;
            int completed = 0;
            void Finish(bool success)
            {
                if (Interlocked.Exchange(ref completed, 1) != 0) return;
                onFinished?.Invoke(success);
                current.Destroy();
                Load();
            }
            current.OnAdFullScreenContentClosed += () =>
                MobileAdsEventExecutor.ExecuteInUpdate(() =>
                    Finish(Interlocked.CompareExchange(ref rewarded, 0, 0) == 1));
            current.OnAdFullScreenContentFailed += _ =>
                MobileAdsEventExecutor.ExecuteInUpdate(() => Finish(false));
            current.Show(_ => Interlocked.Exchange(ref rewarded, 1));
#else
            onFinished?.Invoke(false);
#endif
        }

#if SWORD_ADMOB
        private void Load()
        {
            RewardedAd.Load(adUnitId, new AdRequest(), (loaded, error) =>
            {
                MobileAdsEventExecutor.ExecuteInUpdate(() =>
                {
                    if (error == null) ad = loaded;
                });
            });
        }
#endif
    }
}
