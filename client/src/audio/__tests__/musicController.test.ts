import type { AudioPlayer, AudioStatus } from 'expo-audio';
import { createMusicController } from '../musicController';

function fixture(initiallyActive = true) {
  const players: {
    source: number;
    loop: boolean;
    play: jest.Mock;
    pause: jest.Mock;
    remove: jest.Mock;
    unsubscribe: jest.Mock;
    finish: () => void;
  }[] = [];
  const createPlayer = jest.fn((source: number) => {
    let listener: ((status: AudioStatus) => void) | undefined;
    const unsubscribe = jest.fn();
    const player = {
      source,
      loop: false,
      play: jest.fn(),
      pause: jest.fn(),
      remove: jest.fn(),
      addListener: jest.fn((_event: string, callback: (status: AudioStatus) => void) => {
        listener = callback;
        return { remove: unsubscribe };
      }),
      unsubscribe,
      finish: () => listener?.({ didJustFinish: true } as AudioStatus),
    };
    players.push(player);
    return player as unknown as AudioPlayer;
  });
  const controller = createMusicController({ background: 1, fight: 2, victory: 3, defeat: 4 }, createPlayer, initiallyActive);
  return { controller, players, createPlayer };
}

it('switches route tracks and loops only the background and fight music', () => {
  const f = fixture();
  f.controller.setRoute('/map', 'background');
  expect(f.players).toHaveLength(1);
  expect(f.players[0]).toMatchObject({ source: 1, loop: true });
  expect(f.players[0].play).toHaveBeenCalledTimes(1);

  f.controller.setRoute('/game/1', 'fight');
  expect(f.players).toHaveLength(2);
  expect(f.players[0].remove).toHaveBeenCalledTimes(1);
  expect(f.players[1]).toMatchObject({ source: 2, loop: true });
  expect(f.players[1].play).toHaveBeenCalledTimes(1);
  f.controller.dispose();
});

it('plays each result cue once, stays silent when it ends, and resumes fight music on retry', () => {
  const f = fixture();
  f.controller.setRoute('/game/1', 'fight');
  f.controller.playResultCue('victory', 'won:run-1');
  expect(f.players).toHaveLength(2);
  expect(f.players[0].remove).toHaveBeenCalledTimes(1);
  expect(f.players[1]).toMatchObject({ source: 3, loop: false });

  f.controller.playResultCue('victory', 'won:run-1');
  expect(f.players).toHaveLength(2);
  f.players[1].finish();
  expect(f.players[1].remove).toHaveBeenCalledTimes(1);
  f.controller.setRoute('/game/1', 'fight');
  expect(f.players).toHaveLength(2);

  f.controller.resumeLoop();
  expect(f.players).toHaveLength(3);
  expect(f.players[2]).toMatchObject({ source: 2, loop: true });

  f.controller.playResultCue('defeat', 'lost:run-2');
  expect(f.players).toHaveLength(4);
  expect(f.players[2].remove).toHaveBeenCalledTimes(1);
  expect(f.players[3]).toMatchObject({ source: 4, loop: false });
  f.controller.dispose();
});

it('pauses while the app is inactive and resumes the same track when active', () => {
  const f = fixture();
  f.controller.setRoute('/map', 'background');
  f.controller.setAppActive(false);
  expect(f.players[0].pause).toHaveBeenCalledTimes(1);
  f.controller.setAppActive(true);
  expect(f.players[0].play).toHaveBeenCalledTimes(2);
  expect(f.players).toHaveLength(1);
  f.controller.dispose();
});

it('applies route changes made in the background when the app becomes active', () => {
  const f = fixture();
  f.controller.setRoute('/map', 'background');
  f.controller.setAppActive(false);
  f.controller.setRoute('/game/1', 'fight');
  expect(f.players[0].remove).toHaveBeenCalledTimes(1);
  expect(f.players).toHaveLength(1);

  f.controller.setAppActive(true);
  expect(f.players).toHaveLength(2);
  expect(f.players[1]).toMatchObject({ source: 2, loop: true });
  f.controller.dispose();
});

it('disposes its player and ignores later playback requests', () => {
  const f = fixture();
  f.controller.setRoute('/map', 'background');
  f.controller.dispose();
  expect(f.players[0].remove).toHaveBeenCalledTimes(1);
  f.controller.setRoute('/game/1', 'fight');
  f.controller.playResultCue('defeat', 'lost:run-1');
  expect(f.players).toHaveLength(1);
});
