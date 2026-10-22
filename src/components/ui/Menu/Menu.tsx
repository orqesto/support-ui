import { Check } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { MenuItemProps, MenuProps } from './menu.types';

const EDGE_MARGIN_PX = 8;

const MenuCloseContext = createContext<() => void>(() => undefined);

/**
 * An action menu: a trigger and a panel of items, portalled to <body> so a scroll container or
 * a table row's overflow never clips it. Closes on Escape, on a click outside, and when an item
 * runs. For picking a VALUE, use `Select`; this is for commands (Open, Copy link, Delete…) and
 * stepped pickers that are commands underneath (Filter by → Status → Open).
 */
export const Menu = ({
  trigger,
  children,
  ariaLabel,
  align = 'start',
  width = 240,
  className,
}: MenuProps) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((was) => !was), []);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) {
      setPos(null);
      return undefined;
    }
    const place = () => {
      if (!rootRef.current) return;
      const rect = rootRef.current.getBoundingClientRect();
      const visibleWidth = document.documentElement.clientWidth;
      const wanted = align === 'end' ? rect.right - width : rect.left;
      const left = Math.max(EDGE_MARGIN_PX, Math.min(wanted, visibleWidth - width - EDGE_MARGIN_PX));
      const height = panelRef.current?.offsetHeight ?? 0;
      const below = document.documentElement.clientHeight - rect.bottom - 4;
      // Flip above when it does not fit below and there is more room above.
      const top =
        height <= below || rect.top - 4 <= below
          ? rect.bottom + window.scrollY + 4
          : rect.top - height + window.scrollY - 4;
      const next = { top, left: left + window.scrollX };
      setPos((prev) => (prev?.top === next.top && prev.left === next.left ? prev : next));
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, align, width]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // The menu takes this Escape: a sheet or dialog behind it must not close too.
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <span ref={rootRef} className={cn('inline-flex relative', className)}>
      {trigger({ open, toggle })}
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-label={ariaLabel}
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width }}
            className="absolute z-[9999] p-1 rounded-lg border shadow-xl border-border bg-card text-card-foreground"
          >
            <MenuCloseContext.Provider value={close}>
              {typeof children === 'function' ? children(close) : children}
            </MenuCloseContext.Provider>
          </div>,
          document.body
        )}
    </span>
  );
};

export const MenuItem = ({
  onSelect,
  children,
  icon,
  hint,
  checked,
  danger,
  disabled,
  keepOpen,
}: MenuItemProps) => {
  const close = useContext(MenuCloseContext);
  const checkable = checked !== undefined;
  return (
    <Button
      variant="ghost"
      role={checkable ? 'menuitemcheckbox' : 'menuitem'}
      aria-checked={checkable ? checked : undefined}
      disabled={disabled}
      onClick={() => {
        onSelect();
        if (!keepOpen) close();
      }}
      className={cn(
        'flex gap-2 justify-start items-center px-2 w-full h-auto font-normal text-left rounded-md min-h-[34px] text-[13px]',
        danger ? 'text-destructive hover:text-destructive' : 'text-foreground'
      )}
    >
      {checkable && (
        <span className="w-3.5 shrink-0 text-primary">{checked && <Check className="w-3.5 h-3.5" />}</span>
      )}
      {icon && <span className="grid place-items-center shrink-0 text-muted-foreground">{icon}</span>}
      <span className="flex-1 min-w-0 truncate">{children}</span>
      {hint && <span className="ml-auto text-xs text-muted-foreground shrink-0">{hint}</span>}
    </Button>
  );
};

export const MenuLabel = ({ children }: { children: ReactNode }) => (
  <div className="px-2 pt-2 pb-1 text-[10.5px] font-semibold tracking-wider uppercase font-display text-muted-foreground">
    {children}
  </div>
);

export const MenuSeparator = () => <div role="separator" className="my-1 h-px bg-border" />;

export const MenuNote = ({ children }: { children: ReactNode }) => (
  <p className="px-2 py-1.5 text-xs leading-snug text-muted-foreground">{children}</p>
);
