/**
 * What the composer should do about WhatsApp's 24-hour window.
 *
 * Meta only permits a free-form reply within 24 hours of the customer's last message;
 * outside it the sole legal payload is a pre-approved template. The backend enforces this
 * at send time, so without this the agent writes a whole reply and only then learns it
 * cannot be delivered.
 */

export type WhatsAppWindow = {
  open: boolean;
  /** Absolute ISO instant the window closes; null when the customer has never written. */
  expiresAt: string | null;
  reason: 'open' | 'expired' | 'no_inbound';
};

export type ComposerWindowState = {
  /** True when the send button must be disabled. */
  blocked: boolean;
  /** Agent-facing explanation. Null when nothing needs saying. */
  notice: string | null;
  /** Set when the window is open and closing soon enough to be worth showing. */
  remaining: string | null;
  /** Drives the visual weight of the notice. */
  tone: 'none' | 'info' | 'warning' | 'blocked';
};

/** Show a countdown only once it is actionable — a full day of "23h left" is noise. */
const REMAINING_VISIBLE_MS = 6 * 60 * 60 * 1000;

const formatRemaining = (ms: number): string => {
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  // Under a minute still reads as "1m" rather than "0m" — an agent about to lose the
  // window should not be told they have no time at all while the send still works.
  return `${Math.max(minutes, 1)}m`;
};

/**
 * Decide the composer's state for a conversation.
 *
 * `mode` matters: an internal NOTE is never delivered to the customer, so the window does
 * not apply to it. Blocking notes would stop an agent recording context on exactly the
 * conversations that most need it.
 *
 * Recomputed from `expiresAt` on every render rather than trusting a number the server
 * sent — a detail view can sit open for hours, and a stale "2h left" on an expired window
 * is precisely the lie this feature exists to remove.
 */
export const resolveComposerWindow = (
  window: WhatsAppWindow | null | undefined,
  mode: 'reply' | 'note',
  now: Date = new Date()
): ComposerWindowState => {
  const idle: ComposerWindowState = { blocked: false, notice: null, remaining: null, tone: 'none' };

  // Not a WhatsApp conversation, or an internal note: nothing to police.
  if (!window || mode === 'note') return idle;

  if (window.reason === 'no_inbound') {
    return {
      blocked: true,
      notice:
        'WhatsApp only allows a free-form message after the customer has written to you. This conversation has no message from them yet.',
      remaining: null,
      tone: 'blocked',
    };
  }

  const expiresAt = window.expiresAt ? new Date(window.expiresAt).getTime() : null;
  const msLeft = expiresAt === null ? 0 : expiresAt - now.getTime();

  // Trust the clock, not the flag. The server said `open` when it built the payload; if
  // the window has since elapsed, the send would fail and the agent must know now.
  if (!window.open || msLeft <= 0) {
    return {
      blocked: true,
      notice:
        'The 24-hour reply window has closed. WhatsApp only allows an approved template until the customer writes again.',
      remaining: null,
      tone: 'blocked',
    };
  }

  if (msLeft <= REMAINING_VISIBLE_MS) {
    return {
      blocked: false,
      notice: 'Reply window closes soon — after that only an approved template can be sent.',
      remaining: formatRemaining(msLeft),
      tone: 'warning',
    };
  }

  return { ...idle, remaining: formatRemaining(msLeft), tone: 'info' };
};
