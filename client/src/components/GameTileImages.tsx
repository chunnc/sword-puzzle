import React, { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { useImage, type SkImage } from '@shopify/react-native-skia';
import { ART } from '../assets';

export type GameTileImages = Readonly<Partial<Record<number, SkImage | null>>>;
const TileImagesContext = createContext<GameTileImages | null>(null);
const SOURCES = [ART.tileSword, ART.tileSword4, ART.tileSword5, ART.tileFire, ART.tileFire4, ART.tileFire5,
  ART.tileLightning, ART.tileLightning4, ART.tileLightning5, ART.tileSpiritOrb, ART.tileSpiritOrb4, ART.tileSpiritOrb5,
  ART.tileRock, ART.tileSword5Idle, ART.tileFire5Idle, ART.tileLightning5Idle, ART.tileSpiritOrb5Idle];

/** Load board sprites first; the larger decorative idle atlases can follow the first render. */
export function GameTileImageProvider({ children }: PropsWithChildren) {
  const [idleAtlasesReady, setIdleAtlasesReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setIdleAtlasesReady(true), 500);
    return () => clearTimeout(timer);
  }, []);
  const loaded = [useImage(SOURCES[0]), useImage(SOURCES[1]), useImage(SOURCES[2]), useImage(SOURCES[3]),
    useImage(SOURCES[4]), useImage(SOURCES[5]), useImage(SOURCES[6]), useImage(SOURCES[7]), useImage(SOURCES[8]),
    useImage(SOURCES[9]), useImage(SOURCES[10]), useImage(SOURCES[11]), useImage(SOURCES[12]),
    useImage(idleAtlasesReady ? SOURCES[13] : null), useImage(idleAtlasesReady ? SOURCES[14] : null),
    useImage(idleAtlasesReady ? SOURCES[15] : null), useImage(idleAtlasesReady ? SOURCES[16] : null)];
  const images = useMemo(() => Object.fromEntries(SOURCES.map((source, index) => [source, loaded[index]])), loaded);
  return <TileImagesContext.Provider value={images}>{children}</TileImagesContext.Provider>;
}

export function useGameTileImages() { return useContext(TileImagesContext); }

/** An explicit cache bridges the separate Skia React root; standalone previews still load locally. */
export function useGameTileImage(source: number | null | undefined, images?: GameTileImages | null) {
  const context = useGameTileImages();
  const cache = images ?? context;
  const shared = source != null && cache != null && source in cache;
  const local = useImage(shared ? null : source);
  return shared ? cache[source!] ?? null : local;
}
