import React from 'react';
import { InventoryCollection } from './InventoryCollection';
import { ShopCollection } from './ShopCollection';
import type { CollectionCategory } from './CollectionTabs';

type CollectionProps = { shop?: boolean; initialCategory?: CollectionCategory };

export function CollectionScreen({ shop = false, initialCategory = 'sword' }: CollectionProps) {
  return shop ? <ShopCollection initialCategory={initialCategory} /> : <InventoryCollection initialCategory={initialCategory} />;
}
