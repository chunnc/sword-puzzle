import { createSfxSequence } from '../sfxSequence';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('waits for the animation start and preserves both sword strokes 60ms apart', async () => {
  const play = jest.fn();
  const sequence = createSfxSequence([
    { id: 'sword_slash', delayMs: 0 }, { id: 'sword_slash', delayMs: 60, reducedDelayMs: 60 },
  ], play);
  jest.advanceTimersByTime(1000); expect(play).not.toHaveBeenCalled();
  sequence.start(); expect(play).toHaveBeenCalledTimes(1);
  sequence.start(); jest.advanceTimersByTime(59); expect(play).toHaveBeenCalledTimes(1);
  sequence.reduce(); jest.advanceTimersByTime(1); await sequence.finished;
  expect(play.mock.calls).toEqual([['sword_slash'], ['sword_slash']]);
  sequence.reduce(); jest.runAllTimers(); expect(play).toHaveBeenCalledTimes(2);
});

it('compresses pending windup cues on reduced motion without replaying emitted cues', async () => {
  const play = jest.fn();
  const sequence = createSfxSequence([{ id: 'rock_break', delayMs: 0 }, { id: 'fire_burst', delayMs: 220 }], play);
  sequence.start(); jest.advanceTimersByTime(100); sequence.reduce(); await sequence.finished;
  jest.runAllTimers(); expect(play.mock.calls).toEqual([['rock_break'], ['fire_burst']]);
});

it('cancels queued sounds permanently and tolerates playback failures', async () => {
  const play = jest.fn(() => { throw new Error('audio unavailable'); });
  const sequence = createSfxSequence([{ id: 'star_award', delayMs: 0 }, { id: 'star_award', delayMs: 100 }], play);
  expect(() => sequence.start()).not.toThrow();
  sequence.cancel(); sequence.start(); sequence.reduce(); jest.runAllTimers(); await sequence.finished;
  expect(play).toHaveBeenCalledTimes(1);
});

it('keeps the 60ms gap in reduced motion while removing elemental windup', async () => {
  const play = jest.fn();
  const sequence = createSfxSequence([
    { id: 'spirit_absorb', delayMs: 200 }, { id: 'sword_slash', delayMs: 0 },
    { id: 'sword_slash', delayMs: 60, reducedDelayMs: 60 },
  ], play);
  sequence.start(true); expect(play).toHaveBeenCalledTimes(2);
  jest.advanceTimersByTime(60); await sequence.finished; expect(play).toHaveBeenCalledTimes(3);
});
