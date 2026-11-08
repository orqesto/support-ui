import type { MutableRefObject, RefObject } from 'react';
import { useEffect } from 'react';
import { KEEPS_COMPOSER_OPEN } from './composerConstants';

type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

/** The composer opens on a press inside and folds (only while empty) on a press outside. */
export function useOutsidePressFold({
  rootRef,
  foldedByThisClickRef,
  openRef,
  draftEmptyRef,
  aiActiveRef,
  setOpen,
  setRestGeneration,
}: {
  rootRef: RefObject<HTMLDivElement>;
  foldedByThisClickRef: MutableRefObject<boolean>;
  openRef: MutableRefObject<boolean>;
  draftEmptyRef: MutableRefObject<boolean>;
  aiActiveRef: MutableRefObject<boolean>;
  setOpen: Setter<boolean>;
  setRestGeneration: Setter<number>;
}) {
  /*
    Open on a press inside, fold on a press outside — decided by where the press BEGAN.

    ⛔ Not by the click's target. React 18 re-renders in a microtask between its root listener and
    a document listener, so by the time a document click listener runs, a control that removed
    itself (Write reply → spinner, Close AI panel, Edit recipients, Remove file) is DETACHED:
    `root.contains(target)` is false and an inside tap read as outside, folding an empty composer
    mid-action. The pointerdown (capture phase, before anything re-renders) records where the
    press began; the click's capture phase takes that record (or, for a click with no pointer —
    the keyboard — judges the still-attached target), and the bubble phase acts on it after the
    page has handled the click. Taking it in the CAPTURE phase means a handler that stops the
    click's propagation cannot leave a stale record for the next one.
  */
  useEffect(() => {
    type Press = 'composer' | 'keep' | 'outside';
    let pointerPress: Press | null = null;
    let clickPress: Press | null = null;
    const judge = (target: EventTarget | null): Press | null => {
      if (!(target instanceof Node) || !target.isConnected) return null;
      if (rootRef.current?.contains(target)) return 'composer';
      const element = target instanceof Element ? target : target.parentElement;
      return element?.closest(KEEPS_COMPOSER_OPEN) ? 'keep' : 'outside';
    };
    const onPointerDown = (event: PointerEvent) => {
      pointerPress = judge(event.target);
    };
    const onPointerCancel = () => {
      pointerPress = null;
    };
    const onClickCapture = (event: MouseEvent) => {
      clickPress = pointerPress ?? judge(event.target);
      pointerPress = null;
    };
    const onClick = () => {
      const press = clickPress;
      clickPress = null;
      // This click is the Collapse that just folded the box: it must not reopen it.
      if (foldedByThisClickRef.current) {
        foldedByThisClickRef.current = false;
        return;
      }
      if (press === 'composer') {
        if (!openRef.current) setOpen(true);
        return;
      }
      if (press !== 'outside' || !openRef.current) return;
      // A draft is never folded away — nor an AI request in flight.
      if (!draftEmptyRef.current || aiActiveRef.current) return;
      setOpen(false);
      setRestGeneration((gen) => gen + 1);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointercancel', onPointerCancel, true);
    document.addEventListener('click', onClickCapture, true);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointercancel', onPointerCancel, true);
      document.removeEventListener('click', onClickCapture, true);
      document.removeEventListener('click', onClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps as before the split; the setters/refs passed in are stable
  }, []);
}
