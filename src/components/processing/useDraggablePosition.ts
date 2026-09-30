import { useCallback, useEffect, useState } from 'react';

type Position = { xPos: number; yPos: number };

const PANEL_WIDTH = 320;

/** Inside this window: a place remembered on a wider screen must not open a panel off it. */
const clamp = (position: Position): Position => ({
  xPos: Math.max(0, Math.min(position.xPos, window.innerWidth - PANEL_WIDTH)),
  yPos: Math.max(0, Math.min(position.yPos, window.innerHeight - 100)),
});

/**
 * A panel sits in the bottom-right stack until the person drags it; only a DRAGGED place is
 * remembered. (The old widget wrote its computed default on mount, so every agent had a
 * position "saved" that nobody chose — ProgressWidgetStaysOffTheHeader.)
 */
export const useDraggablePosition = (storageKey: string, enabled: boolean) => {
  const [position, setPosition] = useState<Position | null>(() => {
    if (!enabled) return null;
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? clamp(JSON.parse(saved) as Position) : null;
    } catch {
      return null;
    }
  });
  const [drag, setDrag] = useState<Position | null>(null);

  const onMouseDown = (event: React.MouseEvent<HTMLElement>) => {
    if (!enabled) return;
    if ((event.target as HTMLElement).closest('button, a')) return;
    const box = event.currentTarget.getBoundingClientRect();
    setDrag({ xPos: event.clientX - box.left, yPos: event.clientY - box.top });
  };

  const remember = useCallback(
    (next: Position) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Not remembered: it goes back to the stack next time.
      }
    },
    [storageKey]
  );

  useEffect(() => {
    if (!drag) return;
    let last: Position | null = null;
    const handleMove = (event: MouseEvent) => {
      last = clamp({ xPos: event.clientX - drag.xPos, yPos: event.clientY - drag.yPos });
      setPosition(last);
    };
    const handleUp = () => {
      setDrag(null);
      if (last) remember(last);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [drag, remember]);

  // The window shrank: keep a placed panel reachable (its close button with it).
  useEffect(() => {
    const handleResize = () => setPosition((current) => (current ? clamp(current) : current));
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return { position: enabled ? position : null, dragging: drag !== null, onMouseDown };
};
