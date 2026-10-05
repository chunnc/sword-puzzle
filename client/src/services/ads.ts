import mobileAds, {
  AdEventType,
  RewardedAd,
  RewardedAdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';

let initialization: Promise<unknown> | null = null;

export function hasRewardedAdUnit(): boolean {
  return __DEV__ || Boolean(process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID);
}

export function initializeRewardedAds(): Promise<unknown> {
  if (!initialization) {
    initialization = mobileAds().initialize().catch((error) => {
      initialization = null;
      throw error;
    });
  }
  return initialization;
}

export async function showRewardedForIntent(customData: string): Promise<boolean> {
  const unitId = __DEV__ ? TestIds.REWARDED : (process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID ?? '');
  if (!unitId) return false;

  await initializeRewardedAds();
  const ad = RewardedAd.createForAdRequest(unitId, {
    serverSideVerificationOptions: { customData },
  });

  return new Promise<boolean>((resolve) => {
    let earned = false;
    let finished = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const unsubscribers: Array<() => void> = [];

    const finish = (result: boolean) => {
      if (finished) return;
      finished = true;
      if (timeout) clearTimeout(timeout);
      for (const unsubscribe of unsubscribers) unsubscribe();
      ad.destroy();
      resolve(result);
    };

    unsubscribers.push(
      ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => { earned = true; }),
      ad.addAdEventListener(AdEventType.CLOSED, () => finish(earned)),
      ad.addAdEventListener(AdEventType.ERROR, (error) => {
        if (error.phase === 'load' || error.phase === 'show') finish(false);
      }),
      ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
        ad.show().catch(() => finish(false));
      }),
    );
    timeout = setTimeout(() => finish(false), 45_000);
    try {
      ad.load();
    } catch {
      finish(false);
    }
  });
}
