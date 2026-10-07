import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { CollectionScreen } from '../src/components/CollectionScreen';
export default function InventoryScreen() {
  const { category } = useLocalSearchParams<{ category?: string }>();
  return <CollectionScreen initialCategory={category === 'skill' ? 'skill' : 'sword'} />;
}
