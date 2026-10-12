export const colors = {
  ink: '#062f32',
  inkDeep: '#062427',
  jade: '#0b5051',
  jadeBright: '#1a7772',
  gold: '#d7b76e',
  goldBright: '#f2d58e',
  ivory: '#fff2c9',
  parchment: '#f6e5b9',
  textMuted: '#c9d4c5',
  success: '#9ee5c9',
  red: '#e35646',
  blue: '#49c8e5',
  veil: 'rgba(1, 18, 23, 0.62)',
  boardFrame: '#33494C',
  boardCell: '#53696B',
};

export const chargedTileParticle = {
  cycleMs: 1600,
  insetRatio: .08,
  cornerRatio: .05,
  radiusRatio: .045,
  maxRadius: 2.4,
  haloRatio: 2.2,
  tailCount: 4,
  tailSpacing: .017,
  colors: { sword: '#FFE08A', fire: '#FF765B', lightning: '#D79CFF', spirit: '#87F7A7' },
};

export const type = {
  title: { fontSize: 23, fontWeight: '800' as const, letterSpacing: 1.3 },
  heading: { fontSize: 18, fontWeight: '800' as const, letterSpacing: 0.5 },
  body: { fontSize: 15, fontWeight: '600' as const },
  caption: { fontSize: 12, fontWeight: '700' as const, letterSpacing: 0.7 },
  number: { fontSize: 25, fontWeight: '900' as const },
};
