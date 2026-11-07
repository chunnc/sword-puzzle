import React, { useState } from 'react';
import { Image } from 'expo-image';
import type { ImageStyle, StyleProp } from 'react-native';
import { enemyAvatarURL } from '../enemyAvatars';
import { ART } from '../assets';

export function GameplayEnemyPortrait({ artKey, style }: {
  artKey?: string;
  style: StyleProp<ImageStyle>;
}) {
  const [failedURL, setFailedURL] = useState<string>();
  const uri = enemyAvatarURL(artKey);
  const useFallback = !uri || failedURL === uri;
  return <Image
    source={useFallback ? ART.beast : uri}
    cachePolicy={useFallback ? 'none' : 'memory'}
    onError={uri && !useFallback ? () => setFailedURL(uri) : undefined}
    contentFit="contain"
    style={style}
    accessible={false}
  />;
}
