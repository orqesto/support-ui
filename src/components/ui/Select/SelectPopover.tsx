import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactSelectLib, { type Props as ReactSelectProps } from 'react-select';
import CreatableSelect from 'react-select/creatable';
import { Check } from 'lucide-react';
import { cn, safeCssColor } from '@/lib/utils';
import { matchesLabel } from './selectFilter';
import type { Option } from './select.types';

/** Gap kept between the panel and either edge of the visible page. */
const EDGE_MARGIN_PX = 8;

type SelectPopoverProps = {
  trigger: (state: { open: boolean; toggle: () => void }) => React.ReactNode;
  options: Option[];
  selectedValues: string[];
  multi: boolean;
  emit: (next: Option | readonly Option[] | null) => void;
  align: 'start' | 'end';
  width: number;
  searchable: boolean;
  creatable: boolean;
  onCreate?: (input: string) => void;
  createLabel?: (input: string) => string;
  placeholder?: React.ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  noOptionsMessage?: ReactSelectProps<Option, boolean>['noOptionsMessage'];
  filterOption?: ReactSelectProps<Option, boolean>['filterOption'];
  panelProps?: React.HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string | boolean>;
};

/** The colour dot a stored colour (label hex) draws before the option text. */
export const ColorDot = ({ color }: { color: string }) => (
  <span
    aria-hidden
    className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-1 ring-border"
    style={{ backgroundColor: safeCssColor(color) }}
  />
);

/**
 * `variant="popover"`: the caller's trigger opens a panel — a non-modal `role="dialog"` named by
 * `aria-label` — holding a search box and the list. The panel is portalled to <body> so a
 * scrolling or clipped container cannot cut it or grow under it, and it is kept on screen:
 *
 * ⛔ Clamped with the width it is DRAWN at against the width you can SEE
 * (`documentElement.clientWidth`, not `innerWidth`, which includes the scrollbar). A panel hanging
 * past the page widens the document and the search box's autofocus then scrolls the page sideways
 * (staging 2026-09-29, the message-header label picker: scrollWidth 595 → 622).
 *
 * Single: picking closes it. Multi: it stays open while ticking. Escape or a press outside the
 * trigger and the panel closes it. Open state is internal unless `open`/`onOpenChange` are given.
 */
export const SelectPopover = ({
  trigger,
  options,
  selectedValues,
  multi,
  emit,
  align,
  width,
  searchable,
  creatable,
  onCreate,
  createLabel,
  placeholder,
  disabled,
  ariaLabel,
  className,
  open: openProp,
  onOpenChange,
  noOptionsMessage,
  filterOption,
  panelProps,
}: SelectPopoverProps) => {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOpenState(next);
    onOpenChange?.(next);
  };
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  /** Cancels a pending focus-return wait (its document listeners, observer and timer). */
  const stopWaitRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopWaitRef.current?.(), []);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) {
      setPos(null);
      return undefined;
    }
    const place = (event?: Event) => {
      // The panel's own list scrolling moves nothing.
      if (event?.target instanceof Node && panelRef.current?.contains(event.target)) return;
      if (!rootRef.current) return;
      const rect = rootRef.current.getBoundingClientRect();
      const visibleWidth = document.documentElement.clientWidth;
      const wanted = align === 'end' ? rect.right - width : rect.left;
      const inView = Math.max(
        EDGE_MARGIN_PX,
        Math.min(wanted, visibleWidth - width - EDGE_MARGIN_PX)
      );
      // Page coordinates: the panel is absolutely positioned in <body>.
      const next = { top: rect.bottom + window.scrollY + 4, left: inView + window.scrollX };
      setPos((prev) => (prev && prev.top === next.top && prev.left === next.left ? prev : next));
    };
    place();
    // Follow the trigger when a scroll container (capture: any of them) or the window moves it.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
    // selectedValues.length: a tick can add a chip before the trigger and move it (ticket labels).
  }, [open, align, width, selectedValues.length]);

  /*
    Flip above the trigger when the panel cannot fit below it and there is more room above —
    a trigger at the bottom of the screen (the composer's Templates menu) otherwise drops the
    whole list off the page: the search box shows, every option is under the window's edge.
    The first `pos` is always below (the panel is not mounted to measure yet); this pass reads
    the drawn height and moves the panel in the same layout pass, before the paint. The
    observer re-anchors it as the filtered list grows or shrinks, so the flipped panel keeps
    its edge against the trigger rather than leaving a gap.
  */
  useLayoutEffect(() => {
    if (!open || pos === null) return undefined;
    const panel = panelRef.current;
    if (!panel) return undefined;
    const fit = () => {
      if (!rootRef.current) return;
      const rect = rootRef.current.getBoundingClientRect();
      const height = panel.offsetHeight;
      const below = document.documentElement.clientHeight - rect.bottom - 4;
      const above = rect.top - 4;
      const top =
        height <= below || above <= below
          ? rect.bottom + window.scrollY + 4
          : rect.top - height + window.scrollY - 4;
      setPos((prev) => (prev === null || prev.top === top ? prev : { top, left: prev.left }));
    };
    fit();
    // jsdom has none — as RelatedPopover guards the same call.
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(fit);
      observer.observe(panel);
    }
    return () => observer?.disconnect();
    // pos: every `place` (scroll, resize, a tick that moves the trigger) writes the below
    // position — re-measuring on the new pos corrects it in the same layout pass.
  }, [open, pos]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
    // setOpen is recreated each render; the listener only needs the latest via closure on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = () => {
    if (!disabled) setOpen(!open);
  };
  const close = () => setOpen(false);
  /** Escape or a pick: close and give the focus back to the trigger, where the user was. */
  const closeToTrigger = () => {
    close();
    const target = rootRef.current?.querySelector<HTMLElement>(
      'button, [href], input, [tabindex]:not([tabindex="-1"])'
    );
    // After the panel (which held the focus) is gone.
    window.setTimeout(() => {
      if (!target) return;
      if (!(target as HTMLButtonElement).disabled) {
        target.focus({ preventScroll: true });
        return;
      }
      /*
       * A pick can disable its own trigger (TranslateButton: busy while translating), and focus()
       * on a disabled button does nothing — the focus fell to <body>. Wait until it is enabled
       * again — but ANY click or key press meanwhile cancels the wait: a click on plain text also
       * leaves the focus on <body>, so "focus is still on body" cannot tell "the user did nothing"
       * from "the user went elsewhere", and yanking focus back then turned their next Space into
       * reopening this picker.
       */
      let timer = 0;
      const stop = () => {
        stopWaitRef.current = null;
        observer.disconnect();
        window.clearTimeout(timer);
        document.removeEventListener('pointerdown', stop, true);
        document.removeEventListener('keydown', stop, true);
      };
      const observer = new MutationObserver(() => {
        if ((target as HTMLButtonElement).disabled) return;
        stop();
        if (document.activeElement === document.body || document.activeElement === null) {
          target.focus({ preventScroll: true });
        }
      });
      observer.observe(target, { attributes: true, attributeFilter: ['disabled'] });
      document.addEventListener('pointerdown', stop, true);
      document.addEventListener('keydown', stop, true);
      timer = window.setTimeout(stop, 60_000);
      stopWaitRef.current?.();
      stopWaitRef.current = stop;
    }, 0);
  };

  const value = multi
    ? options.filter((opt) => selectedValues.includes(opt.value))
    : (options.find((opt) => opt.value === selectedValues[0]) ?? null);

  const shared = {
    autoFocus: true,
    menuIsOpen: true,
    'aria-label': ariaLabel,
    options,
    value,
    isMulti: multi,
    isSearchable: searchable || creatable,
    isDisabled: disabled,
    placeholder: placeholder ?? 'Search…',
    controlShouldRenderValue: false,
    hideSelectedOptions: false,
    isClearable: false,
    backspaceRemovesValue: false,
    tabSelectsValue: false,
    closeMenuOnSelect: !multi,
    filterOption: filterOption ?? matchesLabel,
    noOptionsMessage: noOptionsMessage ?? (() => 'No matches.'),
    onChange: (next: unknown) => {
      emit(next as Option | readonly Option[] | null);
      if (!multi) closeToTrigger();
    },
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        // The popover's Escape, not the surrounding Dialog's (see Select's onKeyDown).
        event.nativeEvent.stopPropagation();
        closeToTrigger();
      }
    },
    components: { DropdownIndicator: null, IndicatorSeparator: null },
    formatOptionLabel: (data: Option, { context }: { context: 'menu' | 'value' }) =>
      context === 'menu' ? (
        <span className="flex gap-2 items-center w-full">
          {data.color && <ColorDot color={data.color} />}
          <span className="flex-1 truncate">{data.menuLabel ?? data.label}</span>
          {selectedValues.includes(data.value) && (
            <Check className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
          )}
        </span>
      ) : (
        data.label
      ),
    unstyled: true,
    classNames: {
      control: () =>
        'min-h-0 h-8 px-2 mb-1 rounded border border-border bg-background text-sm max-sm:text-base focus-within:ring-1 focus-within:ring-ring',
      valueContainer: () => '!p-0',
      placeholder: () => 'text-muted-foreground',
      // ⛔ 16px on phones: iOS zooms the page into any focused input smaller than that.
      input: () => 'text-sm max-sm:text-base',
      menu: () => '!static !m-0 !shadow-none',
      menuList: () => 'max-h-64 overflow-y-auto',
      option: ({ isFocused, isDisabled }: { isFocused: boolean; isDisabled: boolean }) =>
        cn(
          'flex items-center rounded px-2 py-1.5 text-sm text-foreground cursor-pointer',
          isFocused && 'bg-accent',
          isDisabled && 'opacity-50 cursor-not-allowed'
        ),
      noOptionsMessage: () => 'px-2 py-1.5 text-sm text-muted-foreground text-left',
    },
  };

  return (
    <div ref={rootRef} className={cn('inline-block relative', className)}>
      {trigger({ open, toggle })}
      {open &&
        pos &&
        createPortal(
          <div
            {...panelProps}
            ref={panelRef}
            role="dialog"
            aria-label={ariaLabel}
            style={{ top: pos.top, left: pos.left, width }}
            className="absolute z-[9999] rounded-lg border border-border bg-card text-card-foreground shadow-xl p-1"
          >
            {creatable ? (
              <CreatableSelect<Option, boolean>
                {...shared}
                onCreateOption={(input) => {
                  onCreate?.(input.trim());
                  if (!multi) closeToTrigger();
                }}
                formatCreateLabel={(input) =>
                  createLabel?.(input.trim()) ?? `Create "${input.trim()}"`
                }
                // No create row for an exact (case-insensitive, trimmed) match.
                isValidNewOption={(input) =>
                  input.trim().length > 0 &&
                  !options.some((opt) => opt.label.toLowerCase() === input.trim().toLowerCase())
                }
              />
            ) : (
              <ReactSelectLib<Option, boolean> {...shared} />
            )}
          </div>,
          document.body
        )}
    </div>
  );
};
