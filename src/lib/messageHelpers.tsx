import { Mail, MessageCircle, MessageSquare } from 'lucide-react';

export const getChannelIcon = (channel: string | null | undefined) => {
  switch (channel) {
    case 'email':
      return <Mail className="w-4 h-4" />;
    // Distinct from the other chat channels: WhatsApp is the only one that can refuse a
    // send, so an agent scanning a list benefits from telling it apart at a glance.
    case 'whatsapp':
      return <MessageCircle className="w-4 h-4" />;
    case 'slack':
    case 'telegram':
    case 'chat':
      return <MessageSquare className="w-4 h-4" />;
    default:
      return <Mail className="w-4 h-4" />;
  }
};

export const getCategoryDisplay = (suggestedCat?: string) => {
  if (!suggestedCat) {
    return null;
  }
  // If it's a numeric ID, just show "Category #X", otherwise show the name
  if (/^\d+$/.test(suggestedCat)) {
    return `Category #${suggestedCat}`;
  }
  // If it contains letters, it's likely a name - show it directly
  return suggestedCat;
};

export const hasMessageAttachments = (message: { attachmentCount?: number }) =>
  (message.attachmentCount ?? 0) > 0;

/**
 * A thread event that is OURS, not the customer's: anything not inbound, the bot, or a system
 * reply. The thread bubble (ThreadMessageItem) and the Files row (MessageAttachments) both read an
 * event through this, so a file and the message it came with cannot sit on opposite sides.
 */
export const isOutgoingEvent = (event: {
  type: string;
  authorEmail?: string | null;
  metadata?: unknown;
}): boolean =>
  event.type !== 'inbound' ||
  (event.authorEmail ?? '').toLowerCase() === 'bot' ||
  (event.metadata as { isSystemReply?: boolean } | null | undefined)?.isSystemReply === true;

/**
 * The display name and the address out of a `Name <addr>` sender. A bare address (or a phone
 * number, or a chat handle) has no name — the caller then shows the address itself, bold.
 * Surrounding quotes are the mail header's, not part of the name. A name that IS the address
 * (`a@x.com <a@x.com>`) is no name: the address shows once. Shared by the message header and the
 * Customer tab, so the two cannot name one sender two ways.
 */
export const parseSender = (
  sender: string | null | undefined
): { name: string | null; address: string } => {
  const raw = (sender ?? '').trim();
  // The address is the LAST `<…>` holding an '@': a quoted display name may itself contain angle
  // brackets (`"Smith <Sales>" <s@x.com>`), and text may trail the address
  // ("Ada <a@x.io> (via form)") — the header's contact-profile lookup needs the bare address, not
  // the whole line. With no '@' anywhere (a chat handle in brackets) the last `<…>` still wins.
  const angles = [...raw.matchAll(/<([^<>]+)>/g)];
  if (angles.length === 0) return { name: null, address: raw };
  const angle =
    [...angles].reverse().find((match) => match[1].includes('@')) ?? angles[angles.length - 1];
  const address = angle[1].trim();
  // A quote at either end is the header's quoting, even an unbalanced one.
  const name = raw.slice(0, angle.index).trim().replace(/^"|"$/g, '').trim();
  return {
    name: name.length > 0 && name.toLowerCase() !== address.toLowerCase() ? name : null,
    address,
  };
};

/**
 * The Customer tab's contact-lookup key: the sender block's address (parseSender) when it is an
 * email — `"Smith <Sales>" <s@x.com>` → s@x.com, not "Sales". With no '@' (a chat handle) the
 * earlier resolution stands, the first `<…>` or the whole line: D17 still wants a key for those.
 */
export const contactLookupKey = (sender: string | null | undefined): string => {
  const { address } = parseSender(sender);
  if (address.includes('@')) return address;
  return sender?.match(/<(.+?)>/)?.[1] ?? sender ?? '';
};

/**
 * Conversation identifier for display. Prefers the Jira-style publicId
 * ('SUP-42') and falls back to '#16798' for unstamped legacy rows / rows
 * that bypassed the orchestrator stamping. See
 * planning/public-id-design.md for the lifecycle.
 *
 * When `orgCode` is supplied (from useCurrentOrgCode), the stored dept-scoped
 * id is rendered with the org prefix — `ACM-SUP-42` — so the visible id reads
 * org-dept-number and can't be confused across orgs. The org code is a display
 * prefix only: the stored publicId and the email-subject token stay `SUP-42`.
 * The numeric fallback (`#16798`) is never org-prefixed.
 */
export const formatConvId = (
  msg: { id: number; publicId?: string | null },
  orgCode?: string | null
): string => {
  if (!msg.publicId) return `#${msg.id}`;
  return orgCode ? `${orgCode}-${msg.publicId}` : msg.publicId;
};

/**
 * Conversation identifier for URL building. Prefers publicId ('SUP-42',
 * URL-safe alphanumeric + hyphen) over the numeric id. Used by every
 * `?id=` writer and the copy-link button so shared URLs survive across
 * orgs with different ID counters.
 *
 * The BE's `resolveConvIdFromParam` (messageController.ts) accepts the bare
 * `SUP-42`, the numeric `16952`, AND the org-prefixed `ADM-SUP-42` forms —
 * backward-compatible.
 *
 * When `orgCode` is supplied (copy-link / shareable-URL writers), the id is
 * org-prefixed — `ADM-SUP-42` — so the copied link matches the visible chip
 * (`formatConvId`). `resolveConvIdFromParam` strips a *matching* `{orgCode}-`
 * and 404s a non-matching one (a shared link can't resolve another org's conv).
 * Internal nav / URL-sync writers omit `orgCode` and keep the bare dept-scoped
 * form. The numeric fallback is never org-prefixed.
 */
export const getConvUrlId = (
  msg: { id: number; publicId?: string | null },
  orgCode?: string | null
): string => {
  if (!msg.publicId) return msg.id.toString();
  return orgCode ? `${orgCode}-${msg.publicId}` : msg.publicId;
};

// Spam Check helpers
type SpamCheckData = {
  isSpam?: boolean;
  category?: string;
  confidence?: number;
  reason?: string;
  redFlags?: string[];
  greenFlags?: string[];
  handling?: string;
  intent?: string;
};

const FILTERED_HANDLINGS = new Set(['ignore', 'archive', 'flag_security']);

export const isFilteredSpamCheck = (spamCheck?: SpamCheckData): boolean =>
  !!spamCheck?.handling && FILTERED_HANDLINGS.has(spamCheck.handling);

export const getSpamCheck = (message: {
  metadata?: Record<string, unknown> | null;
}): SpamCheckData | undefined => message.metadata?.spamCheck as SpamCheckData | undefined;

/**
 * Whether a conversation belongs to one of the triage queues (suspicious,
 * not_analysed, archived, spam) — the only place the per-user read/unread
 * indicator applies. Mirrors the BE messageFilters predicates for those views.
 */
export const isTriageMessage = (message: {
  status?: string;
  metadata?: Record<string, unknown> | null;
}): boolean => {
  const spam = getSpamCheck(message);
  // not_analysed + archived both live under status='filtered'.
  if (message.status === 'filtered') return true;
  // suspicious: category='suspicious' AND not filtered (mirrors BE messageFilters;
  // the BE suspicious predicate has NO terminal-status exclusion, so a
  // resolved/closed conv that is still flagged suspicious remains suspicious).
  if (spam?.category === 'suspicious') return true;
  // spam: mirror the BE spam queue, which excludes terminal/needs_routing statuses
  // so a conv that WAS spam but is now resolved/closed no longer counts as triage.
  if (
    (spam?.isSpam === true || spam?.category === 'spam') &&
    message.status !== 'resolved' &&
    message.status !== 'closed' &&
    message.status !== 'needs_routing'
  ) {
    return true;
  }
  return false;
};

export const getFilteredCategoryLabel = (category?: string): string => {
  if (!category) return 'Filtered';

  switch (category) {
    case 'promotional':
      return 'Promotional';
    case 'transactional':
      return 'Transactional';
    case 'invalid':
      return 'Invalid Response';
    case 'unsubscribe':
      return 'Unsubscribe';
    case 'spam':
    case 'scam':
    case 'phishing':
      return 'Spam';
    case 'legitimate':
      return 'Legitimate';
    default:
      return 'Filtered';
  }
};

// Maps raw internal signal flag strings to human-readable labels shown in the UI.
export const humanizeSignalFlag = (flag: string): string => {
  if (flag.startsWith('spam-keyword:')) return `Spam keyword: "${flag.slice(13)}"`;
  switch (flag) {
    // Quick check signals
    case 'all-caps-subject':
      return 'All-caps subject line';
    case 'excessive-exclamation':
      return 'Excessive exclamation marks';
    case 'missing-sender':
      return 'Missing or invalid sender address';
    case 'suspicious-url':
      return 'Suspicious URL (shortener or risky TLD)';
    case 'crypto-wallet':
      return 'Crypto wallet address in body';
    case 'lookalike-domain':
      return 'Lookalike domain — possible brand spoofing';
    case 'homoglyph-subject':
      return 'Mixed-script characters in subject (homoglyph attack)';
    case 'phone-in-body':
      return 'Phone number in body';
    // Email auth
    case 'dmarc-fail':
      return 'DMARC authentication failed';
    case 'dmarc-pass':
      return 'DMARC passed';
    case 'spf-fail':
      return 'SPF check failed';
    case 'spf-pass':
      return 'SPF passed';
    case 'dkim-fail':
      return 'DKIM signature invalid';
    case 'dkim-pass':
      return 'DKIM signature valid';
    // Sender history
    case 'first-contact':
      return 'First message from this sender';
    case 'velocity-high':
      return 'High sending velocity (unusual burst)';
    case 'velocity-medium':
      return 'Elevated sending velocity';
    case 'known-sender':
      return 'Known legitimate sender';
    default:
      return flag;
  }
};

// Returns display metadata for the action strip based on spam category.
// Drives the taxonomy distinction: system archives vs noise vs security threats.
export type FilteredCategoryMeta = {
  statusText: string;
  statusClass: string; // tailwind class for the status label
  approveLabel: string;
  approveClass: string; // tailwind classes for the approve button
  showMoveToSpam: boolean; // false for phishing/scam — they're threats, not spam
};

export const getFilteredCategoryMeta = (category?: string): FilteredCategoryMeta => {
  switch (category) {
    case 'phishing':
      return {
        statusText: 'Quarantined · Phishing threat detected',
        statusClass: 'text-destructive',
        approveLabel: 'Not a Threat — Approve',
        approveClass: 'border border-warning-line text-warning hover:bg-warning-muted',
        showMoveToSpam: false,
      };
    case 'scam':
      return {
        statusText: 'Quarantined · Scam detected',
        statusClass: 'text-destructive',
        approveLabel: 'Not a Threat — Approve',
        approveClass: 'border border-warning-line text-warning hover:bg-warning-muted',
        showMoveToSpam: false,
      };
    case 'transactional':
      return {
        statusText: 'Auto-archived · System / transactional email',
        statusClass: 'text-muted-foreground',
        approveLabel: 'Approve — Move to Open',
        approveClass: 'bg-primary text-primary-foreground hover:bg-primary/90',
        showMoveToSpam: false,
      };
    case 'out_of_office':
      return {
        statusText: 'Auto-archived · Out of office reply',
        statusClass: 'text-muted-foreground',
        approveLabel: 'Approve — Move to Open',
        approveClass: 'bg-primary text-primary-foreground hover:bg-primary/90',
        showMoveToSpam: false,
      };
    default:
      return {
        statusText: 'Filtered — excluded from active inbox',
        statusClass: 'text-muted-foreground',
        approveLabel: 'Approve — Move to Open',
        approveClass: 'bg-primary text-primary-foreground hover:bg-primary/90',
        showMoveToSpam: false,
      };
  }
};

/**
 * The spam check's own verdict, named. This tile used to read `isSpam` alone, and a
 * `suspicious` or `solicitation` verdict also carries `isSpam: false` — so it said "Legit"
 * right beside the SUSPICIOUS badge (taco COR-SUP-2654, 2026-09-18), and was read as the AI
 * having cleared the message.
 */
const SPAM_CLASS_LABELS: Record<string, string> = {
  legitimate: 'Legit',
  suspicious: 'Suspicious',
  solicitation: 'Solicitation',
  spam: 'Spam',
  promotional: 'Promotional',
  phishing: 'Phishing',
  scam: 'Scam',
  transactional: 'Transactional',
};
export const spamClassLabel = (spamCheck: { isSpam?: boolean; category?: string }): string => {
  if (spamCheck.category && SPAM_CLASS_LABELS[spamCheck.category]) {
    return SPAM_CLASS_LABELS[spamCheck.category];
  }
  if (spamCheck.isSpam === true) return 'Spam';
  if (spamCheck.isSpam === false) return spamCheck.category ? spamCheck.category : 'Legit';
  return 'Unknown';
};
