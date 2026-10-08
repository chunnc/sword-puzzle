import type { ExpoConfig } from 'expo/config';

const androidAdMobAppId = process.env.ADMOB_ANDROID_APP_ID ?? 'ca-app-pub-3940256099942544~3347511713';
const iosAdMobAppId = process.env.ADMOB_IOS_APP_ID ?? 'ca-app-pub-3940256099942544~1458002511';

const config: ExpoConfig = {
  name: 'Kiếm Khai Tiên Lộ',
  slug: 'kiem-khai-tien-lo',
  scheme: 'kiemkhai',
  version: '1.2.0',
  platforms: ['ios', 'android'],
  orientation: 'portrait',
  ios: {
    bundleIdentifier: 'com.kiemkhaitienlo',
    deploymentTarget: '16.4',
    supportsTablet: false,
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: 'com.kiemkhaitienlo',
    predictiveBackGestureEnabled: true,
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-build-properties',
      {
        ios: { enableSceneSupport: true },
        android: { minSdkVersion: 28 },
      },
    ],
    [
      'react-native-google-mobile-ads',
      {
        androidAppId: androidAdMobAppId,
        iosAppId: iosAdMobAppId,
      },
    ],
  ],
  extra: {
    gameApiUrl: process.env.EXPO_PUBLIC_GAME_API_URL ?? '',
    rewardedAdUnitId: process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID ?? '',
  },
};

export default config;
