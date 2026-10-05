import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, type } from '../theme';

export function Notice({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, 2400);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;
  return (
    <View pointerEvents="none" style={styles.notice}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    position: 'absolute',
    zIndex: 30,
    bottom: 78,
    alignSelf: 'center',
    maxWidth: '92%',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 22,
    borderColor: colors.gold,
    borderWidth: 1,
    backgroundColor: colors.inkDeep,
  },
  text: { ...type.body, color: colors.ivory, textAlign: 'center' },
});
