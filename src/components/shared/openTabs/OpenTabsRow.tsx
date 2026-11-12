import { useEffect, useRef, type ReactNode } from 'react';
import { ChevronDown, Layers, Pencil, X } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { Button } from '@/components/ui/Button';
import { Menu, MenuItem, MenuLabel, MenuNote, MenuSeparator } from '@/components/ui/Menu';
import { Tooltip } from '@/components/ui/Tooltip';
import type { OpenTab } from '@/lib/openTabs';
import { cn } from '@/lib/utils';
import { useOpenTabsView, type OpenTabsHandle } from './useOpenTabs';

type RowTab = OpenTab & { draft: boolean };

type OpenTabsRowViewProps = {
  items: RowTab[];
  activeKey: string | null;
  onSelect: (key: string) => void;
  onClose: (key: string) => void;
  onKeep?: (key: string) => void;
  onCloseOthers?: (key: string) => void;
  onCloseAll?: () => void;
  /** "Open threads" / "Open tickets": the tablist's name. */
  ariaLabel: string;
  /** Only the "N open ▾" button, for a narrow header (the phone's thread page). */
  compact?: boolean;
  className?: string;
};

const ROW =
  'flex flex-shrink-0 items-stretch min-w-0 h-9 border-b border-border bg-card [@media(pointer:coarse)]:h-11';
const STRIP = 'flex overflow-x-auto flex-1 items-stretch min-w-0 scrollbar-hide';
const tabCell = cva(
  'group/tab relative flex flex-shrink-0 items-center min-w-[7.5rem] max-w-[12rem] border-r border-border text-[12.5px]',
  {
    variants: {
      active: {
        true: 'bg-background text-foreground after:absolute after:inset-x-0 after:top-0 after:h-0.5 after:bg-primary',
        false: 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
      },
    },
    defaultVariants: { active: false },
  }
);
const TAB_BUTTON =
  'flex-1 justify-start gap-1.5 px-2.5 pr-1 h-full min-w-0 rounded-none font-normal text-[12.5px] hover:bg-transparent focus-visible:ring-inset focus-visible:ring-offset-0';
const CLOSE_BUTTON =
  'flex-shrink-0 mr-1 p-0 w-6 h-6 rounded text-muted-foreground hover:text-foreground focus-visible:ring-offset-0 [@media(pointer:coarse)]:w-8 [@media(pointer:coarse)]:h-8';
// A background tab's ✕ shows on hover; on touch screens (no hover) always.
const CLOSE_ON_HOVER =
  'opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100';

const NewsDot = () => (
  <span aria-hidden="true" className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-primary" />
);

const menuHint = (tab: RowTab): ReactNode =>
  tab.draft ? (
    <Pencil aria-label="Unsent draft" className="w-3.5 h-3.5" />
  ) : tab.news ? (
    <NewsDot />
  ) : undefined;

/** What a screen reader hears for a tab: its id, subject and state. */
const spokenTab = (tab: RowTab): string =>
  [
    tab.label,
    tab.title,
    tab.preview ? 'preview' : null,
    tab.news ? 'new activity' : null,
    tab.draft ? 'unsent draft' : null,
  ]
    .filter(Boolean)
    .join(', ');

const AllTabsMenu = ({
  items,
  activeKey,
  onSelect,
  onClose,
  onKeep,
  onCloseOthers,
  onCloseAll,
  compact,
}: OpenTabsRowViewProps) => {
  const active = items.find((tab) => tab.key === activeKey) ?? null;
  return (
    <Menu
      ariaLabel="Open tabs"
      align="end"
      width={280}
      trigger={({ open, toggle }) =>
        compact ? (
          <Button
            variant="outline"
            size="sm"
            aria-expanded={open}
            onClick={toggle}
            className="gap-1.5 px-2.5 h-8 text-[12.5px]"
          >
            <Layers className="w-3.5 h-3.5" />
            {items.length} open
            {items.some((tab) => tab.news && tab.key !== activeKey) && <NewsDot />}
            <ChevronDown className="w-3.5 h-3.5" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={open}
            aria-label={`All ${items.length} open tabs`}
            onClick={toggle}
            className="flex-shrink-0 p-0 w-9 h-full rounded-none border-l border-border"
          >
            <ChevronDown className="w-4 h-4" />
          </Button>
        )
      }
    >
      <MenuLabel>Open tabs</MenuLabel>
      {items.map((tab) => (
        <MenuItem
          key={tab.key}
          checked={tab.key === activeKey}
          hint={menuHint(tab)}
          onSelect={() => onSelect(tab.key)}
        >
          <span className={cn('block truncate', tab.preview && 'italic')}>
            <span className="font-medium">{tab.label}</span>
            {tab.title && <span className="text-muted-foreground"> · {tab.title}</span>}
          </span>
        </MenuItem>
      ))}
      <MenuSeparator />
      {active?.preview && onKeep && (
        <MenuItem onSelect={() => onKeep(active.key)}>Keep this tab open</MenuItem>
      )}
      {active && <MenuItem onSelect={() => onClose(active.key)}>Close this tab</MenuItem>}
      {active && onCloseOthers && items.length > 1 && (
        <MenuItem onSelect={() => onCloseOthers(active.key)}>Close other tabs</MenuItem>
      )}
      {onCloseAll && (
        <MenuItem danger onSelect={onCloseAll}>
          Close all tabs
        </MenuItem>
      )}
      {!compact && <MenuNote>Keys: [ and ] switch tabs, Delete closes the focused tab.</MenuNote>}
    </Menu>
  );
};

/** The row itself, without the store: what tests and the prototype render. */
export const OpenTabsRowView = (props: OpenTabsRowViewProps) => {
  const { items, activeKey, onSelect, onClose, onKeep, ariaLabel, compact, className } = props;
  const stripRef = useRef<HTMLDivElement>(null);
  // Where keyboard focus goes after Delete closed the focused tab (its neighbour), once the row
  // has re-rendered without it.
  const focusAfterClose = useRef<string | null>(null);

  const tabButton = (key: string): HTMLElement | null =>
    stripRef.current?.querySelector<HTMLElement>(
      `[data-tab-key="${CSS.escape(key)}"] [role="tab"]`
    ) ?? null;

  useEffect(() => {
    if (!activeKey) return;
    const cell = stripRef.current?.querySelector(`[data-tab-key="${CSS.escape(activeKey)}"]`);
    cell?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [activeKey, items.length]);

  useEffect(() => {
    const key = focusAfterClose.current;
    if (key === null) return;
    focusAfterClose.current = null;
    tabButton(key)?.focus();
  });

  if (items.length === 0) return null;

  if (compact) {
    // One tab that is the page itself: nothing to switch to.
    if (items.length < 2 && items[0]?.key === activeKey) return null;
    return (
      <div
        data-open-tabs=""
        className={cn('flex flex-shrink-0 justify-end items-center px-3 py-1.5', className)}
      >
        <AllTabsMenu {...props} />
      </div>
    );
  }

  const closeFromKeyboard = (tab: RowTab) => {
    const at = items.indexOf(tab);
    const neighbour = items[at + 1] ?? items[at - 1] ?? null;
    focusAfterClose.current = neighbour?.key ?? null;
    onClose(tab.key);
  };

  return (
    <div data-open-tabs="" className={cn(ROW, className)}>
      <div ref={stripRef} role="tablist" aria-label={ariaLabel} className={STRIP}>
        {items.map((tab) => {
          const isActive = tab.key === activeKey;
          return (
            <div
              key={tab.key}
              role="presentation"
              data-tab-key={tab.key}
              className={tabCell({ active: isActive })}
            >
              <Tooltip
                content={tab.title ? `${tab.label} · ${tab.title}` : tab.label}
                size="sm"
                className="flex flex-1 h-full min-w-0"
              >
                <Button
                  variant="ghost"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={spokenTab(tab)}
                  aria-keyshortcuts="Delete"
                  tabIndex={isActive || (activeKey === null && tab === items[0]) ? 0 : -1}
                  className={TAB_BUTTON}
                  onClick={() => onSelect(tab.key)}
                  onDoubleClick={() => onKeep?.(tab.key)}
                  onAuxClick={(event) => {
                    if (event.button !== 1) return;
                    event.preventDefault();
                    onClose(tab.key);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Delete') {
                      event.preventDefault();
                      closeFromKeyboard(tab);
                      return;
                    }
                    const at = items.indexOf(tab);
                    const to =
                      event.key === 'ArrowRight'
                        ? (at + 1) % items.length
                        : event.key === 'ArrowLeft'
                          ? (at - 1 + items.length) % items.length
                          : event.key === 'Home'
                            ? 0
                            : event.key === 'End'
                              ? items.length - 1
                              : null;
                    if (to === null) return;
                    event.preventDefault();
                    tabButton(items[to].key)?.focus();
                  }}
                >
                  {tab.draft ? (
                    <Pencil aria-hidden="true" className="flex-shrink-0 w-3 h-3" />
                  ) : (
                    tab.news && !isActive && <NewsDot />
                  )}
                  <span className={cn('truncate', tab.preview && 'italic')}>
                    <span className={cn(isActive && 'font-medium')}>{tab.label}</span>
                    {tab.title && (
                      <span className="hidden text-muted-foreground md:inline"> {tab.title}</span>
                    )}
                  </span>
                </Button>
              </Tooltip>
              <Button
                variant="ghost"
                tabIndex={-1}
                aria-hidden="true"
                aria-label={`Close ${tab.label}`}
                className={cn(CLOSE_BUTTON, !isActive && CLOSE_ON_HOVER)}
                onClick={() => onClose(tab.key)}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          );
        })}
      </div>
      <AllTabsMenu {...props} />
    </div>
  );
};

/** The open-tabs row of a page (see useOpenTabs). */
export const OpenTabsRow = ({
  handle,
  ariaLabel,
  compact,
  boxed,
  className,
}: {
  handle: OpenTabsHandle;
  ariaLabel: string;
  compact?: boolean;
  /** Above the list (nothing open): a bordered box like the list's own cards. */
  boxed?: boolean;
  className?: string;
}) => {
  const { tabs, activeKey, draftKeys } = useOpenTabsView(handle);
  return (
    <OpenTabsRowView
      items={tabs.map((tab) => ({ ...tab, draft: draftKeys.has(tab.key) }))}
      activeKey={activeKey}
      onSelect={handle.select}
      onClose={handle.close}
      onKeep={handle.keep}
      onCloseOthers={handle.closeOthers}
      onCloseAll={handle.closeAll}
      ariaLabel={ariaLabel}
      compact={compact}
      className={cn(
        boxed && !compact && 'rounded-md border',
        compact && 'border-b border-border',
        className
      )}
    />
  );
};

/** Wrap the open item: typing in it (a reply, a note) keeps its tab. */
export const KeepTabOnInput = ({
  handle,
  children,
}: {
  handle: OpenTabsHandle;
  children: ReactNode;
}) => (
  <div className="contents" onInputCapture={handle.keepActive}>
    {children}
  </div>
);
