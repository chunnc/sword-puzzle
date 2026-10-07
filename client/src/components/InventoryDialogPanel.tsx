import React, { type PropsWithChildren } from 'react';
import { Image as NativeImage, StyleSheet } from 'react-native';
import { ART } from '../assets';
import { ArtPanel } from './Art';

// Metro supplies the runtime WebP dimensions; the fallback also supports
// environments such as Jest that replace static image modules with stubs.
const source = NativeImage.resolveAssetSource(ART.inventoryDialog);
export const INVENTORY_DIALOG_ASPECT_RATIO = source?.width && source?.height
  ? source.width / source.height : 800 / 671;

export function InventoryDialogPanel({ children, testID }: PropsWithChildren<{ testID?: string }>) {
  return <ArtPanel testID={testID} art="inventoryDialog" contentFit="contain" style={styles.panel}>{children}</ArtPanel>;
}

const styles = StyleSheet.create({
  panel: { width: '100%', maxWidth: 360, aspectRatio: INVENTORY_DIALOG_ASPECT_RATIO },
});
