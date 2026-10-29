// A thin bar with a short grip in the middle; the whole bar is the target (8px tall), the grip only
// shows what it is. `touch-none` keeps a drag from scrolling the page.
export const resizeHandleClass =
  'group relative flex h-2 w-full cursor-row-resize touch-none select-none items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm';

export const resizeGripClass =
  'h-1 w-10 rounded-full bg-border transition-colors group-hover:bg-border-strong group-focus-visible:bg-primary group-active:bg-primary';
