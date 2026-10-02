/**
 * Message detail v4 "Related" visuals — the ticket and merge popovers (`.k-relpop`, `.k-sec`,
 * `.k-tkt`, `.k-lrow`, `.k-group`) and their pickers (`.mg-dlg`, `.mg-opt`, `.mg-new`), as
 * Tailwind on the app's tokens, so both themes follow without a raw colour.
 */

/** `.k-relpop`: the 380px popover under a Related chip. */
export const REL_POPOVER =
  'absolute left-0 top-full mt-1 z-50 grid gap-2.5 w-[380px] max-w-[calc(100vw-32px)] max-h-[70vh] overflow-auto p-[11px] rounded-lg border border-border bg-card shadow-lg text-foreground';

/**
 * v4 mobile (<640px): every header popover is a bottom sheet — fixed 8px from the sides and the
 * bottom, 16px radius, at most 72% of the screen, over a dim scrim (`.pop.open` + `.m-sheet`).
 * Pure CSS behind `max-sm:`; z above the sticky header row (z 7) and composer (z 6).
 */
export const MOBILE_SHEET =
  'max-sm:fixed max-sm:left-2 max-sm:right-2 max-sm:bottom-2 max-sm:top-auto max-sm:mt-0 max-sm:w-auto max-sm:min-w-0 max-sm:max-w-none max-sm:max-h-[72vh] max-sm:overflow-y-auto max-sm:rounded-2xl max-sm:p-2 max-sm:z-[70] max-sm:shadow-2xl';
/** The dim layer behind a phone sheet; nothing from 640px up. */
export const MOBILE_SCRIM = 'hidden max-sm:block fixed inset-0 z-[69] bg-black/40';
/** A sheet's menu row on phones: 46px, 15px text. */
export const MOBILE_SHEET_ITEM = 'max-sm:min-h-[46px] max-sm:text-[15px] max-sm:px-3';

/** `.k-sec` + `.k-h` + `h5.k-ph` */
export const REL_SECTION = 'grid gap-2';
export const REL_SECTION_HEAD = 'flex flex-wrap items-center gap-x-[7px] gap-y-1.5';
export const REL_SECTION_TITLE =
  'flex flex-1 items-center gap-1.5 m-0 font-display text-[12.5px] font-semibold';

/** `.k-relpop button`: a small outline action. */
export const REL_BTN =
  'h-auto px-[9px] py-1 text-[11.5px] font-normal rounded-md border border-border bg-card text-foreground hover:bg-muted hover:border-border-strong';
/** `.k-danger` */
export const REL_BTN_DANGER = `${REL_BTN} !text-destructive hover:bg-destructive-muted`;

/** `.k-tkt`: one ticket card. */
export const REL_TICKET_CARD = 'grid gap-1 px-[11px] py-2.5 rounded-[10px] border border-border bg-card';
/** `.k-jira` */
export const REL_JIRA_TAG =
  'ml-auto text-[10.5px] px-1.5 py-px rounded-[5px] bg-muted text-muted-foreground font-mono';
/** `.k-lead` / `.k-hint` */
export const REL_LEAD = 'm-0 text-[12px] leading-[1.45] text-muted-foreground';
export const REL_HINT = 'm-0 text-[10.5px] leading-[1.45] text-muted-foreground';
/** `.k-group` of `.k-lrow`s; `.k-self` marks this thread. */
export const REL_GROUP = 'grid border border-border rounded-[9px] overflow-hidden';
export const REL_GROUP_ROW =
  'flex items-center gap-1.5 px-[9px] py-[7px] text-[12px] border-t border-border first:border-t-0';
export const REL_ROW =
  'flex items-center gap-1.5 px-2 py-1.5 rounded-[7px] border border-border text-[12px]';

/** `.mg-dlg`: the picker dialog (480px, 14px radius). */
export const MG_DIALOG = 'max-w-[480px] rounded-[14px] border border-border';
export const MG_HEAD = 'border-b-0 pl-[18px] pr-3 pt-3.5 pb-2.5';
export const MG_TITLE = 'font-sans text-[15px] font-semibold';
export const MG_BODY = 'grid gap-2.5 px-[18px] pt-0 pb-4 text-[13px] leading-[1.5]';
export const MG_FOOT = 'px-[18px] py-3 border-t border-border';
/** `.mg-opt`: one choice as a card. */
export const MG_OPTION =
  'flex items-start gap-2.5 px-[11px] py-[9px] rounded-[10px] border border-border bg-card text-left hover:border-border-strong';
export const MG_OPTION_SELECTED = 'border-primary bg-primary-muted';
/** `.mg-new`: the dashed "Create a new ticket from this thread" row. */
export const MG_NEW =
  'w-full justify-start gap-[7px] h-auto px-[11px] py-[9px] rounded-[10px] border border-dashed border-border-strong bg-transparent text-primary text-[12.5px] font-medium hover:bg-primary-muted';
export const MG_DIM = 'text-muted-foreground text-[12px] truncate';
export const MG_EMPTY = 'text-muted-foreground py-1.5';
