import metadata from '../../app-assets/ui/tile_fire_5_idle.json';

export const FIRE5_IDLE = metadata;

export function fire5FrameAt(elapsedMs: number, reduced = false) {
  'worklet';
  const time = reduced ? 0 : ((elapsedMs % metadata.durationMs) + metadata.durationMs) % metadata.durationMs;
  let end = 0;
  for (const frame of metadata.frames) {
    end += frame.durationMs;
    if (time < end) return frame;
  }
  return metadata.frames[0];
}
