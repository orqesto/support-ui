import type { ThreadStatus } from '@/types';
import { CHIP_SENTENCE } from '../messageDetailConstants';

// Manual BE status → kanban column id, so the acting agent's card moves instantly
// on a header status change. Module-scoped (stable identity) so it needn't be a
// hook dependency. Mirrors kanbanColumns.ts (park→on_hold, terminal→resolved).
export const BE_STATUS_TO_COLUMN: Partial<Record<ThreadStatus, string>> = {
  pending: 'on_hold', // park
  resolved: 'resolved',
  closed: 'resolved',
  open: 'open', // reopen / un-hold
};

/** v4 mobile `.arow .chip`: 26px on phones (M3). */
export const PHONE_CHIP = 'max-sm:h-[26px]';
// v4 Related chip (ticket, merged): a sentence-case chip that opens its popover.
export const REL_CHIP = `${CHIP_SENTENCE} h-[23px] ${PHONE_CHIP} px-2 border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground hover:bg-card font-sans`;

// v3 header icon action: 30px target, 15px glyph; the tooltip carries the name (and key).
export const ICON_BTN =
  'relative inline-grid place-items-center w-[30px] h-[30px] rounded-[7px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors';
/** v4 mobile `.hrow .iconbtn`: a 44px target with a 20px glyph (M1, M9). */
export const PHONE_ICON_BTN =
  'max-sm:w-11 max-sm:h-11 max-sm:rounded-xl max-sm:[&>svg]:w-5 max-sm:[&>svg]:h-5';
