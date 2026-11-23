/**
 * A website chat handed to the inbox for a visitor who never left an email address.
 *
 * The backend stores a placeholder requester on such a conversation (`anonymous` at the domain
 * below) and swaps it for the real address once the visitor leaves one. It is not an address:
 * nothing can be delivered to it, so it is never shown, linked or offered as a recipient — the
 * app says "no email" instead, and the reply composer says a reply cannot be sent (the backend
 * refuses one with a 409).
 *
 * ⛔ The ONE definition on this side. The source of truth is the backend's `customerEmail.ts`
 * (a separate repo) — change both together.
 */
import type { ComposerWindowState } from './whatsappWindowState';
import { parseSender } from './messageHelpers';

/** The placeholder's domain: any requester address ending in it is "no email". */
export const NO_EMAIL_VISITOR_DOMAIN = '@chat-widget.local';

/** Shown where the customer's name or address would be, when there is neither. */
export const WEBSITE_VISITOR_NO_EMAIL = 'Website visitor (no email)';

/** The contacts list's one row for ALL such visitors: they are not one person. */
export const WEBSITE_VISITORS_NO_EMAIL = 'Website visitors (no email)';

/** Shown where the address would be, beside a visitor's name. */
export const NO_EMAIL = 'no email';

/** Above the reply box of such a thread, and the reason its Send controls are off. */
export const VISITOR_NO_EMAIL_NOTICE =
  'This visitor left no email address, so a reply cannot be sent. The chat asks them for one; when they leave it, it appears here and you can reply.';

/** Above the reply box of a website chat that has no email account to send a reply from. */
export const CHAT_NO_EMAIL_ACCOUNT_NOTICE =
  'This website chat has no email account to send a reply from, so a reply cannot be sent. Chats started after an admin chooses the "Email account for replies" in the chat widget\'s settings can be replied to.';

/** Why a ticket's reply cannot reach such a thread (after "A reply cannot reach this thread: "). */
export const VISITOR_NO_EMAIL_UNREACHABLE = 'the visitor left no email address.';

/** A requester (`addr` or `Name <addr>`) that is the no-email placeholder. */
export const isNoEmailVisitor = (sender: string | null | undefined): boolean =>
  parseSender(sender).address.trim().toLowerCase().endsWith(NO_EMAIL_VISITOR_DOMAIN);

/**
 * `parseSender` for display: the name and the address as the app shows them. A visitor without
 * an email keeps their name and reads "no email" where the address would be; with no name
 * either, the one line reads "Website visitor (no email)".
 */
export const shownSender = (
  sender: string | null | undefined
): { name: string | null; address: string } => {
  const parsed = parseSender(sender);
  if (!isNoEmailVisitor(sender)) return parsed;
  return parsed.name
    ? { name: parsed.name, address: NO_EMAIL }
    : { name: null, address: WEBSITE_VISITOR_NO_EMAIL };
};

/** A requester as ONE line of text: unchanged, unless it is the no-email placeholder. */
export const senderLabel = (sender: string | null | undefined): string => {
  if (!isNoEmailVisitor(sender)) return sender ?? '';
  const { name } = parseSender(sender);
  return name ? `${name} (${NO_EMAIL})` : WEBSITE_VISITOR_NO_EMAIL;
};

/** An address on its own line (under a name): "no email" for the placeholder. */
export const emailLabel = (email: string | null | undefined): string =>
  isNoEmailVisitor(email) ? NO_EMAIL : (email ?? '');

/**
 * Whether the reply composer is blocked because the visitor of a website chat left no email.
 * A chat reply is delivered by email, so there is nowhere to send one. Internal notes are never
 * delivered to the customer and stay writable — as do status, assignment and resolve.
 */
export const resolveVisitorNoEmailBlock = (
  message: { channel?: string | null; sender?: string | null },
  mode: 'reply' | 'note'
): ComposerWindowState => {
  if (mode === 'note' || message.channel !== 'chat' || !isNoEmailVisitor(message.sender)) {
    return { blocked: false, notice: null, remaining: null, tone: 'none' };
  }
  // `warning`, not `blocked`: nothing went wrong — the thread waits for the visitor's address.
  return { blocked: true, notice: VISITOR_NO_EMAIL_NOTICE, remaining: null, tone: 'warning' };
};

/**
 * Whether a reply to a website chat can go out at all. It is delivered by email, from the email
 * account the chat was handed over with (`messageSourceId`), to the address the visitor left.
 * The backend refuses (409) without either, checking the account first — so does this.
 *
 * `messageSourceId` blocks only when it is `null`: absent means this record does not say (a list
 * shape or a backend that does not send it), and Send stays on — the backend's refusal is then
 * shown after Send, as before.
 */
export const resolveChatReplyBlock = (
  message: { channel?: string | null; sender?: string | null; messageSourceId?: number | null },
  mode: 'reply' | 'note'
): ComposerWindowState => {
  if (mode !== 'note' && message.channel === 'chat' && message.messageSourceId === null) {
    return {
      blocked: true,
      notice: CHAT_NO_EMAIL_ACCOUNT_NOTICE,
      remaining: null,
      // `warning`, as for the missing address: nothing went wrong with this reply.
      tone: 'warning',
    };
  }
  return resolveVisitorNoEmailBlock(message, mode);
};
