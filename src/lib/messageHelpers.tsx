import { Mail, MessageSquare } from 'lucide-react';

export const getChannelIcon = (channel: string | null | undefined) => {
  switch (channel) {
    case 'email':
      return <Mail className="w-4 h-4" />;
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
 * Conversation identifier for display. Prefers the Jira-style publicId
 * ('SUP-42') and falls back to '#16798' for unstamped legacy rows / rows
 * that bypassed the orchestrator stamping. See
 * planning/public-id-design.md for the lifecycle.
 */
export const formatConvId = (msg: { id: number; publicId?: string | null }): string =>
  msg.publicId ?? `#${msg.id}`;

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
    case 'all-caps-subject':      return 'All-caps subject line';
    case 'excessive-exclamation': return 'Excessive exclamation marks';
    case 'missing-sender':        return 'Missing or invalid sender address';
    case 'suspicious-url':        return 'Suspicious URL (shortener or risky TLD)';
    case 'crypto-wallet':         return 'Crypto wallet address in body';
    case 'lookalike-domain':      return 'Lookalike domain — possible brand spoofing';
    case 'homoglyph-subject':     return 'Mixed-script characters in subject (homoglyph attack)';
    case 'phone-in-body':         return 'Phone number in body';
    // Email auth
    case 'dmarc-fail':            return 'DMARC authentication failed';
    case 'dmarc-pass':            return 'DMARC passed';
    case 'spf-fail':              return 'SPF check failed';
    case 'spf-pass':              return 'SPF passed';
    case 'dkim-fail':             return 'DKIM signature invalid';
    case 'dkim-pass':             return 'DKIM signature valid';
    // Sender history
    case 'first-contact':         return 'First message from this sender';
    case 'velocity-high':         return 'High sending velocity (unusual burst)';
    case 'velocity-medium':       return 'Elevated sending velocity';
    case 'known-sender':          return 'Known legitimate sender';
    default:                      return flag;
  }
};

// Returns display metadata for the action strip based on spam category.
// Drives the taxonomy distinction: system archives vs noise vs security threats.
export type FilteredCategoryMeta = {
  statusText: string;
  statusClass: string;       // tailwind class for the status label
  approveLabel: string;
  approveClass: string;      // tailwind classes for the approve button
  showMoveToSpam: boolean;   // false for phishing/scam — they're threats, not spam
};

export const getFilteredCategoryMeta = (category?: string): FilteredCategoryMeta => {
  switch (category) {
    case 'phishing':
      return {
        statusText: 'Quarantined · Phishing threat detected',
        statusClass: 'text-red-500',
        approveLabel: 'Not a Threat — Approve',
        approveClass: 'border border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/30',
        showMoveToSpam: false,
      };
    case 'scam':
      return {
        statusText: 'Quarantined · Scam detected',
        statusClass: 'text-red-500',
        approveLabel: 'Not a Threat — Approve',
        approveClass: 'border border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/30',
        showMoveToSpam: false,
      };
    case 'transactional':
      return {
        statusText: 'Auto-archived · System / transactional email',
        statusClass: 'text-muted-foreground',
        approveLabel: 'Approve — Move to Active',
        approveClass: 'bg-primary text-primary-foreground hover:bg-primary/90',
        showMoveToSpam: false,
      };
    case 'out_of_office':
      return {
        statusText: 'Auto-archived · Out of office reply',
        statusClass: 'text-muted-foreground',
        approveLabel: 'Approve — Move to Active',
        approveClass: 'bg-primary text-primary-foreground hover:bg-primary/90',
        showMoveToSpam: false,
      };
    default:
      return {
        statusText: 'Filtered — excluded from active inbox',
        statusClass: 'text-muted-foreground',
        approveLabel: 'Approve — Move to Active',
        approveClass: 'bg-primary text-primary-foreground hover:bg-primary/90',
        showMoveToSpam: false,
      };
  }
};
