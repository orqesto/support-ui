import { Fragment, type RefObject } from 'react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { MOBILE_SHEET, MOBILE_SHEET_ITEM } from '../relatedStyles';
import type { MoreMenuItem } from './buildMoreMenuItems';

type MoreMenuSheetProps = {
  moreMenuItems: MoreMenuItem[];
  moreSheetRef: RefObject<HTMLDivElement>;
  setMoreOpen: (open: boolean) => void;
};

// The More menu with its scrim (a bottom sheet on a phone, portalled — see where it renders).
export function MoreMenuSheet({ moreMenuItems, moreSheetRef, setMoreOpen }: MoreMenuSheetProps) {
  return (
    <>
      <button
        type="button"
        aria-label="Close"
        className="fixed inset-0 z-40 cursor-default max-sm:z-[69] max-sm:bg-black/40"
        onClick={() => setMoreOpen(false)}
      />
      {/* role=menu: the detail's single-key shortcuts stand down while a menu is open,
        so Esc closes THIS, not the rail behind it (detailShortcuts.ts dialogIsOpen). */}
      <div
        ref={moreSheetRef}
        role="menu"
        data-testid="more-menu"
        className={`absolute top-full right-0 mt-1 z-50 rounded-lg border border-border bg-card shadow-lg p-1 min-w-[190px] ${MOBILE_SHEET}`}
      >
        {moreMenuItems.map((item, index) => {
          // v4 `#morePop`: a rule above the destructive group (the first danger item), so
          // "Mark as suspicious" and "Delete message" never sit flush against everyday actions.
          const separated = item.danger && index > 0 && !moreMenuItems[index - 1].danger;
          const btn = (
            <Button
              key={item.label}
              role="menuitem"
              variant="ghost"
              onClick={item.action}
              disabled={item.disabled}
              className={`w-full flex justify-start items-center gap-2 px-2 py-1.5 h-auto rounded text-xs text-left transition-colors ${MOBILE_SHEET_ITEM} ${item.danger ? 'text-destructive hover:bg-destructive-muted' : 'text-foreground hover:bg-accent'} ${item.disabled ? 'opacity-40 cursor-not-allowed hover:bg-transparent' : ''}`}
            >
              {item.icon}
              {item.label}
            </Button>
          );
          const entry = item.tooltip ? (
            <Tooltip key={item.label} content={item.tooltip} side="left" size="sm">
              <span className="block w-full">{btn}</span>
            </Tooltip>
          ) : (
            btn
          );
          return separated ? (
            <Fragment key={item.label}>
              <hr
                data-testid="more-menu-separator"
                className="my-1 border-0 border-t border-border"
              />
              {entry}
            </Fragment>
          ) : (
            entry
          );
        })}
      </div>
    </>
  );
}
