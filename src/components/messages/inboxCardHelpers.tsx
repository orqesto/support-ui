import type { ReactNode } from 'react';
import type { Message } from '@/types';
import type { MessageThread } from '@/services/message.service';
import { getSpamCheck, hasMessageAttachments } from '@/lib/messageHelpers';
import { formatDuration } from '@/lib/utils';
import type { ContradictionCheckMetadata, MessageAttachmentsAnalyzed } from '@/types/ai';

/**
 * Shared derivations for the redesigned inbox cards (MessageListItem + KanbanCard).
 *
 * Card principle (from CLAUDE_CODE_PROMPT_inbox_cards.md): a card answers
 * which queue, is it mine/grabbable, how urgent, whose move, is it risky.
 * Everything else waits for the detail view.
 */

export type SpineColor = 'red' | 'amber' | 'blue' | 'none';

/**
 * Status spine — 3px colored left border ranking urgency, independent of dept color.
 * Mirrors the spec md:
 *   - red    = SLA breached OR spam
 *   - amber  = SLA at-risk OR needs-review
 *   - blue   = we owe a reply (lastReplyFromClient === true)
 *   - none   = awaiting customer / no signal
 */
export const getSpine = (message: Message, thread: MessageThread): SpineColor => {
  const spamCheck = getSpamCheck(message);
  if (spamCheck?.isSpam === true) return 'red';

  const slaTone = computeSlaTone(message);
  if (slaTone === 'breach') return 'red';
  if (slaTone === 'risk') return 'amber';

  if (message.needsHumanReview) return 'amber';
  if (thread.lastReplyFromClient === true) return 'blue';
  return 'none';
};

/** Maps spine color → Tailwind classes (dark+light tuned). */
export const SPINE_BG: Record<SpineColor, string> = {
  red: 'bg-rose-500/90 dark:bg-rose-400/80',
  amber: 'bg-amber-500/90 dark:bg-amber-400/80',
  blue: 'bg-blue-500/80 dark:bg-blue-400/70',
  none: 'bg-transparent',
};

/**
 * Conversation lifecycle status chip for the inbox cards. Returns null for
 * statuses already surfaced elsewhere so we don't double-badge:
 *   - resolved      → its own emerald "Resolved" chip (list) / Kanban column
 *   - needs_routing → the "Needs Routing" department badge
 *   - filtered      → hidden from the inbox entirely
 */
export const getStatusBadge = (
  status: Message['status'] | 'new' | 'awaiting_response' | 'client_replied'
): { label: string; className: string } | null => {
  switch (status) {
    case 'new':
    case 'open':
      return { label: 'Unreviewed', className: 'bg-slate-500/15 text-slate-700 dark:text-slate-300' };
    // awaiting_response + client_replied roll up into "In Progress" (matches the
    // Thread Status filter grouping). The awaiting-vs-replied distinction is
    // carried by the SLA badge — shown only when we owe a reply — not here.
    case 'in_progress':
    case 'awaiting_response':
    case 'client_replied':
      return { label: 'In Progress', className: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' };
    case 'pending':
      return { label: 'Pending', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' };
    case 'closed':
      return { label: 'Closed', className: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400' };
    default:
      return null;
  }
};

/** Priority chip for the inbox cards — all four levels. */
export const getPriorityBadge = (
  priority: Message['priority']
): { label: string; className: string } | null => {
  switch (priority) {
    case 'critical':
      return { label: 'Critical', className: 'bg-red-500/15 text-red-700 dark:text-red-300' };
    case 'high':
      return { label: 'High', className: 'bg-orange-500/15 text-orange-700 dark:text-orange-300' };
    case 'medium':
      return { label: 'Medium', className: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400' };
    case 'low':
      return { label: 'Low', className: 'bg-slate-500/10 text-slate-500 dark:text-slate-400' };
    default:
      return null;
  }
};

/**
 * SLA status with the elapsed/remaining number. Returns null when there's
 * nothing to show (resolved, no target, or healthy).
 */
type SlaCard = { variant: 'breach' | 'risk'; label: string; detail: string };

export const getSlaCardText = (message: Message): SlaCard | null => {
  if (message.status === 'resolved' || !message.slaResponseMinutes) return null;
  // We replied last → the ball is in the customer's court, so there's no SLA
  // clock on us (awaiting-response cards). Covers seed rows that never stamped
  // firstResponseAt/lastReplyAt but carry lastReplyFromClient=false.
  if (message.lastReplyFromClient === false) return null;
  const target = message.slaResponseMinutes;

  // Follow-up SLA (we already replied once; customer replied again)
  if (message.lastReplyFromClient && message.lastReplyAt) {
    const elapsed = Math.floor((Date.now() - new Date(message.lastReplyAt).getTime()) / 60000);
    const breached = elapsed > target;
    const atRisk = !breached && elapsed > target * 0.8;
    if (breached) {
      return {
        variant: 'breach',
        label: 'Breached',
        detail: `${formatDuration(elapsed - target)} over`,
      };
    }
    if (atRisk) {
      return {
        variant: 'risk',
        label: 'At risk',
        detail: `${formatDuration(target - elapsed)} left`,
      };
    }
    return null;
  }

  // First-response SLA (we haven't replied yet)
  if (!message.firstResponseAt) {
    const slaStart =
      typeof (message.metadata as Record<string, unknown>)?.receivedAt === 'string'
        ? new Date((message.metadata as Record<string, unknown>).receivedAt as string)
        : new Date(message.createdAt);
    const elapsed = Math.floor((Date.now() - slaStart.getTime()) / 60000);
    const breached = message.slaResponseBreached === true || elapsed > target;
    const atRisk = !breached && elapsed > target * 0.8;
    if (breached) {
      return {
        variant: 'breach',
        label: 'Breached',
        detail: `${formatDuration(elapsed - target)} over`,
      };
    }
    if (atRisk) {
      return {
        variant: 'risk',
        label: 'At risk',
        detail: `${formatDuration(target - elapsed)} left`,
      };
    }
  }
  return null;
};

type SlaTone = 'breach' | 'risk' | null;
const computeSlaTone = (message: Message): SlaTone => {
  const card = getSlaCardText(message);
  return card ? card.variant : null;
};

/**
 * AI workflow state — single chip showing where automation left the conv.
 * Distinct from risk signals (risk = something's wrong; AI state = where AI is).
 * Priority order matches the AI State filter in MessageFilters.tsx so the chip
 * label matches what filtering would surface.
 *
 * Sources (mirrors BE `aiSuggested` filter at messageFilters.ts:420 — needs
 * `metadata.suggestedAnswer != null` AND `needsHumanReview = true`):
 *   - "AI suggested"  → needsHumanReview && metadata.suggestedAnswer != null
 *   - "Needs review"  → needsHumanReview (without suggested answer)
 *   - "Lead"          → thread.isLead (with optional stage)
 *   - "Auto-handled"  → metadata.autoReply.sent
 */
export type AiState = {
  label: string;
  tooltip: string;
};

export const getAiState = (message: Message, thread: MessageThread): AiState | null => {
  const meta = message.metadata as
    | {
        suggestedAnswer?: unknown;
        autoReply?: { sent?: boolean };
        leadState?: { stage?: string };
      }
    | undefined;

  if (message.needsHumanReview) {
    if (meta?.suggestedAnswer !== null && meta?.suggestedAnswer !== undefined) {
      return {
        label: 'AI suggested',
        tooltip: 'AI prepared a draft reply — review and send',
      };
    }
    return {
      label: 'Needs review',
      tooltip: 'AI flagged this for human review',
    };
  }
  if (thread.isLead) {
    const stage = meta?.leadState?.stage;
    if (stage) {
      const stageLabel = stage.replace(/_/g, ' ');
      return {
        label: `Lead · ${stageLabel}`,
        tooltip: `Qualified lead · stage: ${stageLabel}`,
      };
    }
    return { label: 'Lead', tooltip: 'Qualified lead' };
  }
  if (meta?.autoReply?.sent) {
    return {
      label: 'Auto-handled',
      tooltip: 'AI sent an automated reply',
    };
  }
  return null;
};

/**
 * Risk signals ordered by severity. Highest is rendered as the visible chip,
 * the rest collapse into a `+N` overflow with a tooltip listing them.
 *
 * needsHumanReview is intentionally absent — it belongs in the AI state chip
 * cluster (see getAiState). Including it both places would double-count.
 */
type RiskSignal = {
  key: string;
  label: string;
  tone: 'breach' | 'risk';
  tooltip: string;
};

export const getRiskSignals = (message: Message): RiskSignal[] => {
  const signals: RiskSignal[] = [];

  const spam = getSpamCheck(message);
  if (spam?.isSpam === true) {
    signals.push({
      key: 'spam',
      label: 'Spam',
      tone: 'breach',
      tooltip: 'Marked as spam',
    });
  } else if (spam?.category === 'suspicious') {
    signals.push({
      key: 'suspicious',
      label: 'Suspicious',
      tone: 'risk',
      tooltip: 'Suspicious sender / content',
    });
  }

  const contradiction = (message.metadata?.contradictionCheck as ContradictionCheckMetadata | undefined)
    ?.result?.hasContradiction;
  if (contradiction) {
    signals.push({
      key: 'contradiction',
      label: 'Contradiction',
      tone: 'risk',
      tooltip: 'Contradicts a previous statement',
    });
  }

  const analysis = message.metadata?.analysis as { needsMoreInfo?: boolean } | undefined;
  if (analysis?.needsMoreInfo) {
    signals.push({
      key: 'needs-info',
      label: 'Needs info',
      tone: 'risk',
      tooltip: 'AI flagged as needing more information',
    });
  }

  const unusual = (message.metadata?.attachmentsAnalyzed as MessageAttachmentsAnalyzed | undefined)
    ?.hasUnusualAttachments;
  if (unusual) {
    signals.push({
      key: 'unusual',
      label: 'Unusual',
      tone: 'risk',
      tooltip: 'Unusual attachments for this organization',
    });
  }

  return signals;
};

/**
 * Direction text for the list view. Kanban uses an arrow icon for the same
 * signal (`thread.lastReplyFromClient`). Tri-state: null when there's no
 * signal yet (single-message thread, no reply history).
 */
export const getDirectionText = (thread: MessageThread): { text: string; tone: 'pending' | 'waiting' | 'new' } | null => {
  if (thread.lastReplyFromClient === true) {
    return { text: 'they replied', tone: 'pending' };
  }
  if (thread.lastReplyFromClient === false) {
    return { text: 'awaiting them', tone: 'waiting' };
  }
  if (thread.messageCount <= 1) {
    return { text: 'new', tone: 'new' };
  }
  return null;
};

/**
 * Compact 2-letter initials from a name or email. Email local-parts get the
 * first two letters; "First Last" gets the first letter of each word.
 */
export const getInitials = (raw: string | null | undefined): string => {
  if (!raw) return '··';
  const trimmed = raw.trim();
  if (!trimmed) return '··';
  // strip RFC-2822 angle brackets if present
  const stripped = trimmed.replace(/<[^>]+>/, '').trim() || trimmed;
  const beforeAt = stripped.split('@')[0] ?? stripped;
  const parts = beforeAt
    .replace(/[._-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) {
    return `${(parts[0]?.[0] ?? '').toUpperCase()}${(parts[1]?.[0] ?? '').toUpperCase()}`;
  }
  const single = parts[0] ?? beforeAt;
  return single.slice(0, 2).toUpperCase();
};

/**
 * Pick a stable color from a small palette by hashing the input. Used for
 * assignee avatars when no explicit color is available.
 */
const AVATAR_PALETTE = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-fuchsia-500',
  'bg-teal-500',
];

export const getAvatarColor = (name: string | null | undefined): string => {
  if (!name) return 'bg-muted-foreground';
  let hash = 0;
  for (let idx = 0; idx < name.length; idx++) {
    hash = (hash * 31 + name.charCodeAt(idx)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length] ?? 'bg-muted-foreground';
};

// Hex equivalents of AVATAR_PALETTE for label creation. The BE requires a hex
// color on POST /api/labels; inline label creation picks a deterministic color
// by hashing the label name so the same name always gets the same color
// (consistent across pickers + sessions before the user recolors).
const LABEL_PALETTE_HEX = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#8b5cf6', // violet-500
  '#f43f5e', // rose-500
  '#06b6d4', // cyan-500
  '#d946ef', // fuchsia-500
  '#14b8a6', // teal-500
];

export const hashNameToLabelColor = (name: string): string => {
  let hash = 0;
  for (let idx = 0; idx < name.length; idx++) {
    hash = (hash * 31 + name.charCodeAt(idx)) | 0;
  }
  return LABEL_PALETTE_HEX[Math.abs(hash) % LABEL_PALETTE_HEX.length] ?? '#6b7280';
};

export const hasAttachments = (message: Message): boolean => hasMessageAttachments(message);

/** Tooltip body listing overflow signals (used by the `+N` chip). */
export const renderOverflowTooltip = (signals: RiskSignal[]): ReactNode => (
  <ul className="space-y-0.5 text-left">
    {signals.map((signal) => (
      <li key={signal.key}>{signal.label}</li>
    ))}
  </ul>
);
