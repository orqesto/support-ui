import {
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  sidebarWidthPx,
  useSidebarStore,
} from '@/stores/sidebarStore';

/**
 * Wraps a sidebar entry in a right-side tooltip carrying its label, but only while
 * the sidebar is collapsed — expanded, the label is already on screen.
 */
export const NavTip = ({
  label,
  children,
  className = 'flex w-full',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) => {
  const collapsed = useSidebarStore((state) => state.collapsed);
  if (!collapsed) return <>{children}</>;
  return (
    <Tooltip content={label} side="right" className={className}>
      {children}
    </Tooltip>
  );
};

export const SidebarCollapseToggle = ({ className }: { className?: string }) => {
  const collapsed = useSidebarStore((state) => state.collapsed);
  const toggle = useSidebarStore((state) => state.toggle);
  const label = `${collapsed ? 'Expand sidebar' : 'Collapse sidebar'} (${SHORTCUT_LABEL})`;
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    // Keyed on state: the button moves when the rail toggles, and a still-open tip
    // would otherwise stay where the button used to be.
    <Tooltip key={String(collapsed)} content={label} side="right">
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-keyshortcuts="Control+Backslash Meta+Backslash"
        aria-expanded={!collapsed}
        className={cn(
          'flex flex-shrink-0 justify-center items-center w-8 h-8 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground',
          className
        )}
      >
        <Icon className="w-4 h-4" />
      </button>
    </Tooltip>
  );
};

/**
 * Where a switcher's menu opens from the collapsed rail: beside the rail, bottom-aligned
 * with its trigger. Fixed-positioned because the sidebar clips overflow, so an absolute
 * menu hanging off a 64px rail would be cut off.
 */
export const railMenuStyle = (trigger: HTMLElement | null): CSSProperties => {
  if (!trigger) return {};
  const rect = trigger.getBoundingClientRect();
  return { position: 'fixed', left: rect.right + 8, bottom: window.innerHeight - rect.bottom };
};

export const RAIL_QUERY = '(min-width: 1024px)';

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const SHORTCUT_LABEL = IS_MAC ? '⌘\\' : 'Ctrl+\\';

/**
 * Shell-level wiring, called once by each shell: publishes the sidebar's current width
 * as `--sidebar-w` on <html> (so page overlays such as the Messages backdrop can offset
 * by it without importing the store) and binds Cmd/Ctrl+\\ to collapse/expand.
 * Cmd/Ctrl+B is taken by the rich-text editor (bold).
 */
export const useSidebarShell = () => {
  const collapsed = useSidebarStore((state) => state.collapsed);
  const width = useSidebarStore((state) => state.width);
  const toggle = useSidebarStore((state) => state.toggle);

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--sidebar-w',
      `${sidebarWidthPx({ collapsed, width })}px`
    );
  }, [collapsed, width]);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== '\\' || !(event.metaKey || event.ctrlKey) || event.altKey) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);
};

const KEY_STEP_PX = 16;

/**
 * Drag handle on the sidebar's right edge. Also a keyboard-operable separator
 * (arrows resize, Home resets) and double-click resets to the default width.
 * Renders nothing while collapsed — the rail has one width.
 */
export const SidebarResizeHandle = ({ className }: { className?: string }) => {
  const collapsed = useSidebarStore((state) => state.collapsed);
  const width = useSidebarStore((state) => state.width);
  const setWidth = useSidebarStore((state) => state.setWidth);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  if (collapsed) return null;

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: width };
    document.body.style.userSelect = 'none';
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setWidth(drag.current.startWidth + event.clientX - drag.current.startX);
  };
  const endDrag = () => {
    drag.current = null;
    document.body.style.userSelect = '';
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') setWidth(width - KEY_STEP_PX);
    else if (event.key === 'ArrowRight') setWidth(width + KEY_STEP_PX);
    else if (event.key === 'Home') setWidth(SIDEBAR_DEFAULT_WIDTH);
    else return;
    event.preventDefault();
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_MIN_WIDTH}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => setWidth(SIDEBAR_DEFAULT_WIDTH)}
      onKeyDown={onKeyDown}
      className={cn(
        'absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none',
        'after:absolute after:inset-y-0 after:left-1/2 after:w-px after:bg-transparent',
        'hover:after:bg-primary/50 focus-visible:outline-none focus-visible:after:bg-primary',
        className
      )}
    />
  );
};
