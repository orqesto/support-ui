import type DOMPurifyType from 'dompurify';
import type React from 'react';
import type { ThreadStatus, TicketPriority } from '@/types';

// ─── Visual constants ─────────────────────────────────────────────────────────

export const MONO = 'text-[10px] font-medium uppercase tracking-wide';
export const CHIP_BASE = `inline-flex items-center gap-1 px-2 py-0.5 rounded border ${MONO} transition-colors`;

// ─── Status display ───────────────────────────────────────────────────────────

export const STATUS_DISPLAY: Record<ThreadStatus, { label: string; dot: string; chip: string }> = {
  open: {
    label: 'UNREVIEWED',
    dot: 'bg-sky-500',
    chip: 'text-sky-700    border-sky-200    bg-sky-50    dark:text-sky-400    dark:bg-sky-950/30    dark:border-sky-800',
  },
  in_progress: {
    label: 'IN PROGRESS',
    dot: 'bg-violet-500',
    chip: 'text-violet-700  border-violet-200  bg-violet-50  dark:text-violet-400  dark:bg-violet-950/30  dark:border-violet-800',
  },
  pending: {
    label: 'PENDING',
    dot: 'bg-amber-400',
    chip: 'text-amber-700  border-amber-200  bg-amber-50  dark:text-amber-400  dark:bg-amber-950/30  dark:border-amber-800',
  },
  resolved: {
    label: 'RESOLVED',
    dot: 'bg-emerald-500',
    chip: 'text-emerald-700 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-800',
  },
  closed: {
    label: 'CLOSED',
    dot: 'bg-muted-foreground/50',
    chip: 'text-muted-foreground border-border bg-muted',
  },
  filtered: {
    label: 'FILTERED',
    dot: 'bg-muted-foreground/30',
    chip: 'text-muted-foreground/60 border-border/50 bg-muted/50',
  },
  needs_routing: {
    label: 'NEEDS ROUTING',
    dot: 'bg-orange-500',
    chip: 'text-orange-700  border-orange-200  bg-orange-50  dark:text-orange-400  dark:bg-orange-950/30  dark:border-orange-800',
  },
};

export const SETTABLE_STATUSES: ThreadStatus[] = ['open', 'in_progress', 'pending', 'closed'];

export const STATUS_MENU_LABELS: Record<ThreadStatus, string> = {
  open: 'Unreviewed',
  in_progress: 'In Progress',
  pending: 'Pending',
  resolved: 'Resolved',
  closed: 'Closed',
  filtered: 'Filtered',
  needs_routing: 'Needs Routing',
};

export const STATUS_OPTIONS = SETTABLE_STATUSES.map((stat) => ({
  value: stat,
  label: STATUS_DISPLAY[stat].label,
  menuLabel: STATUS_MENU_LABELS[stat],
  chipClassName: STATUS_DISPLAY[stat].chip,
  dotClassName: STATUS_DISPLAY[stat].dot,
}));

export const PRIORITY_OPTIONS: {
  value: TicketPriority;
  label: string;
  menuLabel: string;
  chipClassName: string;
  dotClassName: string;
}[] = [
  {
    value: 'low',
    label: 'LOW',
    menuLabel: 'Low',
    dotClassName: 'bg-green-500',
    chipClassName:
      'text-green-700  bg-green-50   border-green-200  dark:text-green-400  dark:bg-green-950/30  dark:border-green-800',
  },
  {
    value: 'medium',
    label: 'MEDIUM',
    menuLabel: 'Medium',
    dotClassName: 'bg-amber-500',
    chipClassName:
      'text-amber-900 bg-amber-100 border-amber-300 dark:text-amber-300 dark:bg-amber-950/30 dark:border-amber-800',
  },
  {
    value: 'high',
    label: 'HIGH',
    menuLabel: 'High',
    dotClassName: 'bg-orange-500',
    chipClassName:
      'text-orange-700 bg-orange-50  border-orange-200 dark:text-orange-400 dark:bg-orange-950/30 dark:border-orange-800',
  },
  {
    value: 'critical',
    label: 'CRITICAL',
    menuLabel: 'Critical',
    dotClassName: 'bg-red-500',
    chipClassName:
      'text-red-700    bg-red-50     border-red-200    dark:text-red-400    dark:bg-red-950/30    dark:border-red-800',
  },
];

export const CHANNEL_ICONS: Record<string, string> = {
  email: '✉',
  telegram: '✈',
  slack: '◆',
  chat: '◉',
  other: '◌',
};

export const THREAD_SANITIZE = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'b',
    'i',
    'u',
    'strong',
    'em',
    'a',
    'ul',
    'ol',
    'li',
    'blockquote',
    'pre',
    'code',
    'hr',
    'span',
    'table',
    'tr',
    'td',
    'th',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel'],
  FORBID_ATTR: ['style', 'class', 'id'],
  ALLOWED_URI_REGEXP: /^https?:/i,
};

/**
 * DOMPurify hook config that forces rel="noopener noreferrer" on target="_blank" anchors.
 * Pass as the second argument to DOMPurify.sanitize alongside a config object.
 */
let noopenerHookRegistered = false;
export function addNoopenerHook(DOMPurify: typeof DOMPurifyType): void {
  if (noopenerHookRegistered) return;
  noopenerHookRegistered = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node: Element) => {
    if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type InboxBadge = { label: string; icon: React.ReactNode; cls: string };

// ─── Pure helper functions ────────────────────────────────────────────────────

export function getInitials(name: string): string {
  const parts = name
    .replace(/<[^>]+>/g, '')
    .split(/[\s@.]+/)
    .filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] ?? '?').toUpperCase();
}

export function minAgo(dateStr: string): number {
  return Math.round((Date.now() - new Date(dateStr).getTime()) / 60000);
}

export function relativeTime(dateStr: string): string {
  const mins = minAgo(dateStr);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function fmtMin(mins: number): string {
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
}

export function renderMarkdown(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

// ─── Ghost answer types ───────────────────────────────────────────────────────

export type GhostOption = {
  answer: string;
  label: string;
  type: 'lead' | 'documentation' | 'similar';
};

export type SuggestedAnswerMeta = {
  answer: string;
  confidence?: number;
  source?: string;
  foundAt?: string;
};

export function toGhostOption(sa: SuggestedAnswerMeta | undefined | null): GhostOption | null {
  if (!sa?.answer) return null;
  const src = sa.source ?? '';
  const isLead = src === 'lead_qualification' || src === 'lead_qualification_kb';
  const isDocs = src === 'documentation';
  return {
    answer: sa.answer,
    label: isLead ? 'LEAD' : isDocs ? 'DOCS' : 'AI',
    type: isLead ? 'lead' : isDocs ? 'documentation' : 'similar',
  };
}

export function splitAtQuote(
  content: string,
  isHtml: boolean
): { main: string; quote: string | null } {
  if (isHtml) {
    for (const pattern of [
      /<hr\s*[^>]*\/?>/i,
      /<div[^>]*(?:gmail_quote|yahoo_quoted|quoted-text)[^>]*>/i,
    ]) {
      const match = content.match(pattern);
      if (match?.index !== undefined && match.index > 80)
        return { main: content.slice(0, match.index).trimEnd(), quote: content.slice(match.index) };
    }
    const bq = content.indexOf('<blockquote');
    if (bq > 150) return { main: content.slice(0, bq).trimEnd(), quote: content.slice(bq) };
    return { main: content, quote: null };
  }
  const idx = content.search(/\n-{3,}|\nOn .{5,} wrote:/);
  if (idx > 50) return { main: content.slice(0, idx).trimEnd(), quote: content.slice(idx) };
  return { main: content, quote: null };
}
