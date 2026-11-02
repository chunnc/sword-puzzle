import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { makeMutable } from 'react-native-reanimated';
import { runOnJS, runOnUI } from 'react-native-worklets';
import type { CellPosition } from '../game/types';
import { pointToCell, type BoardGeometry } from './boardVisuals';
import { BOARD_SWIPE_DISTANCE, swipeNeighbor } from './boardSwipe';

type Contact = { x: number; y: number; source: CellPosition; consumed: boolean };

export function useBoardSwipe({ runId, side, geometry, enabled, tutorialKey, onTutorialDragStart, onSwipe }: {
  runId: string;
  side: number;
  geometry: BoardGeometry;
  enabled: boolean;
  tutorialKey?: string;
  onTutorialDragStart?: (key: string) => void;
  onSwipe: (x1: number, y1: number, x2: number, y2: number) => void;
}) {
  // A new context retires the entire contact, including JS callbacks already queued
  // by a previous run/layout or before the board was locked.
  const context = useMemo(() => ({ contact: makeMutable<Contact | null>(null) }),
    [runId, side, geometry, enabled]);
  const liveContext = useRef<typeof context | null>(null);
  const handlers = useRef({ onSwipe, onTutorialDragStart, tutorialKey });
  useLayoutEffect(() => { handlers.current = { onSwipe, onTutorialDragStart, tutorialKey }; });
  useLayoutEffect(() => {
    liveContext.current = context;
    const contact = context.contact;
    return () => {
      liveContext.current = null;
      runOnUI(() => { contact.value = null; })();
    };
  }, [context]);
  const dispatch = useCallback((source: CellPosition, target: CellPosition) => {
    if (liveContext.current === context && enabled) {
      handlers.current.onSwipe(source.x, source.y, target.x, target.y);
    }
  }, [context, enabled]);
  const dismissTutorial = useCallback(() => {
    if (liveContext.current !== context || !enabled) return;
    const { tutorialKey: key, onTutorialDragStart: dismiss } = handlers.current;
    if (key) dismiss?.(key);
  }, [context, enabled]);
  const hasTutorial = !!tutorialKey;

  return useMemo(() => {
    const contact = context.contact;
    const attempt = (x: number, y: number) => {
      'worklet';
      const start = contact.value;
      if (!enabled || !start || start.consumed) return;
      // Android resets translation on activation. Local coordinates retain the
      // displacement from the original touch, even across that reset.
      const target = swipeNeighbor(start.source, x - start.x, y - start.y, geometry);
      if (!target) return;
      contact.value = { ...start, consumed: true };
      runOnJS(dispatch)(start.source, target);
    };
    return Gesture.Pan().enabled(enabled).minDistance(BOARD_SWIPE_DISTANCE).maxPointers(1)
      .shouldCancelWhenOutside(false)
      .onBegin(event => {
        const source = enabled ? pointToCell(event.x, event.y, side, geometry) : null;
        contact.value = source ? { x: event.x, y: event.y, source, consumed: false } : null;
      })
      .onStart(event => {
        if (contact.value && hasTutorial) runOnJS(dismissTutorial)();
        attempt(event.x, event.y);
      })
      .onUpdate(event => { attempt(event.x, event.y); })
      .onEnd((event, success) => {
        if (success) attempt(event.x, event.y);
        contact.value = null;
      })
      .onFinalize(() => { contact.value = null; });
  }, [context, enabled, side, geometry, dispatch, dismissTutorial, hasTutorial]);
}
