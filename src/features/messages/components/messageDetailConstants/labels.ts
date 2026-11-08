// ─── Visual constants ─────────────────────────────────────────────────────────

// The scanned-label face (tab names, chip labels, field labels, small buttons). It was named
// LABEL and never set a face at all, so every one of these rendered in body Sans — and a grep
// for `font-mono` or `font-display` could not find them. Identifiers take `font-mono`.
export const LABEL = 'font-display text-[10px] font-medium uppercase tracking-[0.09em]';
/**
 * The composer's tool chips and Send — shared by the thread reply box and "Compose new message",
 * so the two composers look and behave as one (owner, 2026-10-19).
 */
// v3 ".ibtn": a quiet bordered tool button. Phones: 36px tall, 12.5px (v4 mobile `.m-open .tools`).
export const COMPOSER_TOOL =
  'inline-flex items-center gap-[5px] px-[9px] py-1 rounded-[7px] border border-border bg-card text-muted-foreground text-[11.5px] hover:border-border-strong hover:text-foreground transition-colors max-sm:h-9 max-sm:text-[12.5px]';
// v3 ".ibtn.aib": the AI role, soft — the draft is a suggestion, not an action.
export const COMPOSER_AI_TOOL =
  'inline-flex items-center gap-[5px] h-auto px-[9px] py-1 rounded-[7px] border border-ai-line bg-ai-muted text-ai text-[11.5px] hover:bg-ai-muted hover:brightness-95 transition-colors';
export const COMPOSER_SEND =
  'flex items-center gap-1 px-[13px] py-[5px] h-auto rounded-[7px] font-display text-[10.5px] font-semibold uppercase tracking-[0.07em] transition-colors data-[inactive]:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90';
/** The send shortcut as the agent's keyboard writes it (the editor accepts both). */
export const SEND_SHORTCUT =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)
    ? '⌘⇧↵'
    : 'Ctrl+Shift+↵';
export const CHIP_BASE = `inline-flex items-center gap-1 px-2 py-0.5 rounded border ${LABEL} transition-colors`;
/**
 * v4 header chip (`.arow .chip .lab`): the same chip, read in sentence case — 12px / 500, no
 * uppercase, no tracking. For the message-detail header's status, SLA, priority and Related chips
 * only; LABEL / CHIP_BASE stay as they are for every other caller.
 */
export const CHIP_SENTENCE =
  'inline-flex items-center gap-[5px] h-[23px] px-2 rounded-md border text-[12px] font-medium leading-none normal-case tracking-normal whitespace-nowrap transition-colors';

/** "In Progress" → "In progress": a status or priority label as the v4 chips read it. */
export const sentenceCase = (label: string): string =>
  label ? label.charAt(0).toUpperCase() + label.slice(1).toLowerCase() : label;

/**
 * "in_progress" → "In progress": a ticket or thread status as every message-detail surface reads
 * it — the Related popover and the Add-to-ticket picker share this, so the two never disagree.
 * Every underscore, not just the first.
 */
export const statusLabel = (status: string): string => sentenceCase(status.replace(/_/g, ' '));

/**
 * "high" → "High": a priority as every message-detail surface words it — the header chip and its
 * menu, the AI tab's suggestion, the Customer tab and the Related popover. One helper, so none of
 * them can drift into "HIGH" or a CSS-capitalised "high".
 */
export const priorityLabel = (priority: string): string => sentenceCase(priority);

/** A channel by its name: "WhatsApp", never the capitalised key "Whatsapp". */
const CHANNEL_NAMES: Record<string, string> = {
  email: 'Email',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  slack: 'Slack',
  chat: 'Chat',
  widget: 'Widget',
  other: 'Other',
};
/**
 * Unknown keys fall back to the key in sentence case — a new channel still reads as a word. A
 * missing channel (an older or newer backend) reads as nothing rather than throwing.
 */
export const channelName = (channel: string | null | undefined): string =>
  channel ? (CHANNEL_NAMES[channel] ?? sentenceCase(channel.replace(/_/g, ' '))) : '';

/** Channels that are product names: they keep their capitals mid-sentence. */
const PROPER_CHANNELS = new Set(['telegram', 'whatsapp', 'slack']);
/**
 * The channel inside a sentence ("Only email threads can merge…", "Only WhatsApp threads…"): the
 * same word as `channelName`, lower case unless it is a product name.
 */
export const channelInSentence = (channel: string | null | undefined): string => {
  const name = channelName(channel);
  return channel && PROPER_CHANNELS.has(channel) ? name : name.toLowerCase();
};

/**
 * The "new ticket from this thread" action, worded once for the More menu and the Related
 * popover so the two never disagree: a lead thread makes a lead ticket. Sentence case (v4).
 */
export const createTicketLabel = (isLead?: boolean | null): string =>
  isLead ? 'Create lead ticket' : 'Create ticket';
