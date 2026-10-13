import type { AudioPlayer, AudioStatus } from 'expo-audio';
import { createSfxPool } from '../sfxPool';

function fixture() {
  let active = true;
  const players: { seekTo: jest.Mock; play: jest.Mock; remove: jest.Mock; unsubscribe: jest.Mock; finish: () => void }[] = [];
  const createPlayer = jest.fn(() => {
    let listener: (status: AudioStatus) => void;
    const unsubscribe = jest.fn();
    const player = { seekTo: jest.fn(() => Promise.resolve()), play: jest.fn(), remove: jest.fn(), unsubscribe,
      addListener: jest.fn((_: string, callback: typeof listener) => { listener = callback; return { remove: unsubscribe }; }),
      finish: () => listener({ didJustFinish: true } as AudioStatus),
    };
    players.push(player); return player as unknown as AudioPlayer;
  });
  const pool = createSfxPool({ sword_slash: 1, star_award: 2 }, createPlayer, () => active);
  return { pool, players, createPlayer, background: () => { active = false; pool.stop(); }, foreground: () => { active = true; } };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

it('reserves before seeking, overlaps full tails, and reuses only completed voices', async () => {
  const f = fixture();
  f.pool.play('sword_slash'); f.pool.play('sword_slash');
  expect(f.players).toHaveLength(2); await flush();
  expect(f.players.every(player => player.play.mock.calls.length === 1)).toBe(true);
  f.pool.play('star_award'); f.pool.play('star_award'); f.pool.play('star_award'); await flush();
  expect(f.players).toHaveLength(5);
  expect(f.players.every(player => player.seekTo.mock.calls.length === 1)).toBe(true);
  f.players[0].finish(); f.pool.play('sword_slash'); await flush();
  expect(f.players).toHaveLength(5); expect(f.players[0].play).toHaveBeenCalledTimes(2);
  f.pool.dispose(); expect(f.players.every(player => player.remove.mock.calls.length === 1 && player.unsubscribe.mock.calls.length === 1)).toBe(true);
});

it('ignores a stale finish while a voice is seeking', async () => {
  const f = fixture(); f.pool.play('sword_slash'); await flush(); f.players[0].finish();
  f.pool.play('sword_slash'); f.players[0].finish(); f.pool.play('sword_slash');
  expect(f.players).toHaveLength(2); await flush();
});

it('cancels async starts on background or disposal and never resumes old voices', async () => {
  const f = fixture(); f.pool.play('star_award'); f.background(); await flush();
  expect(f.players[0].play).not.toHaveBeenCalled();
  f.pool.play('star_award'); expect(f.players).toHaveLength(1);
  f.foreground(); f.pool.play('star_award'); f.pool.dispose(); await flush();
  expect(f.players[1].play).not.toHaveBeenCalled();
  f.pool.play('star_award'); expect(f.players).toHaveLength(2);
});

it('recovers after failed seek, play, or player creation', async () => {
  const f = fixture(); f.pool.play('sword_slash'); await flush(); f.players[0].finish();
  f.players[0].seekTo.mockRejectedValueOnce(new Error('seek'));
  f.pool.play('sword_slash'); await flush();
  f.pool.play('sword_slash'); await flush(); expect(f.players[0].play).toHaveBeenCalledTimes(2);
  f.players[0].finish(); f.players[0].play.mockImplementationOnce(() => { throw new Error('play'); });
  f.pool.play('sword_slash'); await flush(); f.pool.play('sword_slash'); await flush();
  expect(f.players[0].play).toHaveBeenCalledTimes(4);
  f.createPlayer.mockImplementationOnce(() => { throw new Error('create'); });
  expect(() => f.pool.play('star_award')).not.toThrow();
  f.pool.play('star_award'); await flush(); expect(f.players).toHaveLength(2);
});
