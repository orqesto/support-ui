import { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/Button';

type View = { scale: number; x: number; y: number };
const FIT: View = { scale: 1, x: 0, y: 0 };
export const MAX_ZOOM = 6;
const DOUBLE_CLICK_ZOOM = 2.5;
const BUTTON_STEP = 1.5;
/** Pointer travel (px) that turns a press into a drag — and so not a click. */
const DRAG_SLOP = 4;
/** Horizontal travel (px) of an un-zoomed drag that counts as a swipe to the next item. */
const SWIPE_PX = 60;

const clampScale = (scale: number) => Math.min(MAX_ZOOM, Math.max(1, scale));

/** Zoom about the centre, keeping the pan proportional; back at 1× the picture re-centres. */
const zoomed = (view: View, next: number): View => {
  const scale = clampScale(next);
  if (scale === 1) return FIT;
  const ratio = scale / view.scale;
  return { scale, x: view.x * ratio, y: view.y * ratio };
};

/**
 * A picture shown whole (object-contain) that the agent can zoom into and pan around: the
 * buttons, the wheel (a trackpad pinch arrives as ctrl+wheel), a double click to toggle, and a
 * drag to pan while zoomed. Mounted per item (the viewer keys it), so a new item always starts
 * fitted.
 *
 * Native listeners, not React props: React registers `wheel` as passive, so a React `onWheel`
 * cannot stop the page behind from scrolling, and the pointer handlers belong to the stage, not
 * to an interactive element a screen reader should announce. The keyboard path is the zoom
 * buttons.
 */
export const ZoomableImage = ({
  src,
  alt,
  hidden,
  onLoad,
  onError,
  onBackgroundClick,
  onSwipe,
}: {
  src: string;
  alt: string;
  /** Still loading: laid out (so it can load) but invisible under the spinner. */
  hidden: boolean;
  onLoad: () => void;
  onError: () => void;
  onBackgroundClick: () => void;
  onSwipe?: (direction: 1 | -1) => void;
}) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(FIT);
  const [dragging, setDragging] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const callbacks = useRef({ onBackgroundClick, onSwipe });
  callbacks.current = { onBackgroundClick, onSwipe };

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let drag: { startX: number; startY: number; x: number; y: number; moved: boolean } | null =
      null;
    let swallowClick = false;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.002));
      setView((current) => zoomed(current, current.scale * factor));
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const { x, y } = viewRef.current;
      drag = { startX: event.clientX, startY: event.clientY, x, y, moved: false };
      if (viewRef.current.scale > 1) {
        stage.setPointerCapture?.(event.pointerId);
        setDragging(true);
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!drag) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (Math.abs(dx) + Math.abs(dy) > DRAG_SLOP) drag.moved = true;
      if (viewRef.current.scale > 1) {
        const { x, y } = drag;
        setView((current) => ({ ...current, x: x + dx, y: y + dy }));
      }
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!drag) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      swallowClick = drag.moved;
      if (viewRef.current.scale === 1 && Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
        callbacks.current.onSwipe?.(dx < 0 ? 1 : -1);
      }
      drag = null;
      setDragging(false);
    };
    const onClick = (event: MouseEvent) => {
      if (swallowClick) {
        swallowClick = false;
        return;
      }
      // The empty space around the picture is "outside the content": it closes, like the
      // backdrop. A press on the picture itself never does.
      if (event.target === stage) callbacks.current.onBackgroundClick();
    };
    const onDoubleClick = (event: MouseEvent) => {
      event.preventDefault();
      setView((current) => (current.scale > 1 ? FIT : { scale: DOUBLE_CLICK_ZOOM, x: 0, y: 0 }));
    };

    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('pointerdown', onPointerDown);
    stage.addEventListener('pointermove', onPointerMove);
    stage.addEventListener('pointerup', onPointerUp);
    stage.addEventListener('pointercancel', onPointerUp);
    stage.addEventListener('click', onClick);
    stage.addEventListener('dblclick', onDoubleClick);
    return () => {
      stage.removeEventListener('wheel', onWheel);
      stage.removeEventListener('pointerdown', onPointerDown);
      stage.removeEventListener('pointermove', onPointerMove);
      stage.removeEventListener('pointerup', onPointerUp);
      stage.removeEventListener('pointercancel', onPointerUp);
      stage.removeEventListener('click', onClick);
      stage.removeEventListener('dblclick', onDoubleClick);
    };
  }, []);

  const zoomedIn = view.scale > 1;
  return (
    <div className="absolute inset-0">
      <div
        ref={stageRef}
        data-testid="image-stage"
        data-zoom={view.scale.toFixed(2)}
        className={`absolute inset-0 flex items-center justify-center overflow-hidden p-2 sm:p-4 ${
          zoomedIn ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
        }`}
        style={{ touchAction: zoomedIn ? 'none' : 'pan-y' }}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          onLoad={onLoad}
          onError={onError}
          className={`max-w-full max-h-full object-contain select-none ${hidden ? 'opacity-0' : ''}`}
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transition: dragging ? 'none' : 'transform 120ms ease-out',
          }}
        />
      </div>
      {!hidden && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 p-1 rounded-lg border border-border bg-card/90 shadow-sm">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Zoom out"
            title="Zoom out"
            disabled={!zoomedIn}
            onClick={() => setView((current) => zoomed(current, current.scale / BUTTON_STEP))}
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Fit to window"
            title="Fit to window"
            className="min-w-[3.5rem] h-10 font-mono text-xs tabular-nums"
            onClick={() => setView(FIT)}
          >
            {Math.round(view.scale * 100)}%
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Zoom in"
            title="Zoom in"
            disabled={view.scale >= MAX_ZOOM}
            onClick={() => setView((current) => zoomed(current, current.scale * BUTTON_STEP))}
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
};
