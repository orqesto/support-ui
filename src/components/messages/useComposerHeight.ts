import { useEffect, useState, type RefObject } from 'react';
import type { ResizeHandleProps } from '@/components/ui/ResizeHandle';

/*
  The reply / note editor's height, set by dragging the bar on the box's top edge (owner,
  2026-10-29): agents mostly read, then sometimes write a long answer. Remembered per mode on this
  browser; storage can be blocked, so it never throws. Null = the default (grows with the text).
*/
type ComposerMode = 'reply' | 'note';

const heightKey = (mode: ComposerMode) => `odly.composerHeight.${mode}`;

export const readComposerHeight = (mode: ComposerMode): number | null => {
  try {
    const stored = Number(window.localStorage.getItem(heightKey(mode)));
    return Number.isFinite(stored) && stored > 0 ? stored : null;
  } catch {
    return null;
  }
};

const writeComposerHeight = (mode: ComposerMode, height: number | null) => {
  try {
    if (height === null) window.localStorage.removeItem(heightKey(mode));
    else window.localStorage.setItem(heightKey(mode), String(Math.round(height)));
  } catch {
    // Private window or blocked storage: the size simply is not remembered.
  }
};

/** The smallest editor (one line). */
export const EDITOR_MIN_PX = 44;
/** The default: the editor grows with the text up to this, then scrolls. */
const EDITOR_DEFAULT_MAX = '160px';
/** With no panel measured yet (first paint, tests). */
const EDITOR_MAX_FALLBACK_PX = 480;

/**
 * The editor's min/max height, and the drag handle's props (null where there is no handle: the
 * folded box, a phone). The cap is ~60% of the panel the box sits in, less the box's own rows, so
 * the conversation never disappears — measured live. A drag from the default starts at the
 * editor's height right now instead of jumping.
 */
export const useComposerHeight = ({
  rootRef,
  composerMode,
  isPhone,
  atRest,
  remountKey,
  defaultMinHeight,
}: {
  rootRef: RefObject<HTMLElement | null>;
  composerMode: ComposerMode;
  isPhone: boolean;
  atRest: boolean;
  /** Changes when the editor remounts, so the measured box is found again. */
  remountKey: number;
  defaultMinHeight: string;
}) => {
  const [heights, setHeights] = useState<Record<ComposerMode, number | null>>(() => ({
    reply: readComposerHeight('reply'),
    note: readComposerHeight('note'),
  }));
  const [panelHeight, setPanelHeight] = useState(0);
  const [editorShown, setEditorShown] = useState(EDITOR_MIN_PX);

  useEffect(() => {
    const panel = rootRef.current?.parentElement;
    if (!panel || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setPanelHeight(entry.contentRect.height));
    observer.observe(panel);
    return () => observer.disconnect();
  }, [rootRef]);

  useEffect(() => {
    const box = rootRef.current?.querySelector<HTMLElement>('[data-editor-scroll]');
    if (!box || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setEditorShown(entry.contentRect.height));
    observer.observe(box);
    return () => observer.disconnect();
  }, [rootRef, atRest, composerMode, remountKey]);

  const editorMax =
    panelHeight > 0
      ? Math.max(EDITOR_MIN_PX * 2, Math.round(panelHeight * 0.6) - 120)
      : EDITOR_MAX_FALLBACK_PX;
  const chosen = isPhone ? null : heights[composerMode];
  const editorHeight = chosen === null ? null : Math.min(chosen, editorMax);
  const setChosen = (height: number | null) =>
    setHeights((prev) => ({ ...prev, [composerMode]: height }));

  const handle: ResizeHandleProps | null =
    atRest || isPhone
      ? null
      : {
          value: editorHeight ?? Math.max(EDITOR_MIN_PX, Math.round(editorShown)),
          min: EDITOR_MIN_PX,
          max: editorMax,
          onChange: setChosen,
          onCommit: (height) => writeComposerHeight(composerMode, height),
          onReset: () => {
            setChosen(null);
            writeComposerHeight(composerMode, null);
          },
          ariaLabel: composerMode === 'note' ? 'Resize the note box' : 'Resize the reply box',
        };

  return {
    editorMinHeight: editorHeight === null ? defaultMinHeight : `${editorHeight}px`,
    editorMaxHeight: editorHeight === null ? EDITOR_DEFAULT_MAX : `${editorHeight}px`,
    handle,
  };
};
