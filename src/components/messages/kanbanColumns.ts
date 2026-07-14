import {
  Inbox,
  PlayCircle,
  Hourglass,
  PauseCircle,
  CheckCircle2,
  ShieldAlert,
  HelpCircle,
  Ban,
  Archive,
} from 'lucide-react';

// Two orthogonal axes (see .planning/status-model-rework-2026-07-09.md):
//   - lifecycle: the work board (Open → In Progress → Pending → On-hold → Resolved)
//   - triage:    pre-lifecycle classification (Not Analysed · Needs Routing · Suspicious · Spam)
// Rendered on separate tabs. This ONE tagged model + declarative VALID_TARGETS keeps
// A (tabs) vs B (one board + divider) a view-layer flag — no data/DnD rewrite to switch.
export type ColumnAxis = 'lifecycle' | 'triage';

export type KanbanColumnDef = {
  id: string;
  axis: ColumnAxis;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  fixedFilters: Record<string, string>;
  accentColor: string;
  iconClass: string;
  emptyText: string;
};

export const COLUMNS: KanbanColumnDef[] = [
  // --- Lifecycle axis (the work board) ---
  {
    id: 'open',
    axis: 'lifecycle',
    label: 'Open',
    icon: Inbox,
    // lifecycle='open' = unreviewed + client-replied (needs our action). excludeSuspicious
    // keeps suspicious-but-open messages in the Triage tab, not the work board.
    fixedFilters: { lifecycle: 'open', excludeSuspicious: 'true' },
    accentColor: '#3b82f6',
    iconClass: 'text-blue-500',
    emptyText: 'No open messages',
  },
  {
    id: 'in_progress',
    axis: 'lifecycle',
    label: 'In Progress',
    icon: PlayCircle,
    fixedFilters: { lifecycle: 'in_progress', excludeSuspicious: 'true' },
    accentColor: '#8b5cf6',
    iconClass: 'text-violet-500',
    emptyText: 'Nothing in progress',
  },
  {
    id: 'awaiting',
    axis: 'lifecycle',
    label: 'Pending',
    icon: Hourglass,
    // "Pending" = awaiting the customer's response (BE lifecycle='awaiting').
    fixedFilters: { lifecycle: 'awaiting', excludeSuspicious: 'true' },
    accentColor: '#f97316',
    iconClass: 'text-orange-500',
    emptyText: 'Nothing awaiting the customer',
  },
  {
    id: 'on_hold',
    axis: 'lifecycle',
    label: 'On-hold',
    icon: PauseCircle,
    // "On-hold" = parked overlay (BE lifecycle='pending' → parked_at IS NOT NULL).
    fixedFilters: { lifecycle: 'pending' },
    accentColor: '#f59e0b',
    iconClass: 'text-amber-500',
    emptyText: 'Nothing on hold',
  },
  {
    id: 'resolved',
    axis: 'lifecycle',
    label: 'Resolved',
    icon: CheckCircle2,
    // lifecycle='resolved' returns resolved + closed (single terminal state).
    fixedFilters: { lifecycle: 'resolved' },
    accentColor: '#10b981',
    iconClass: 'text-emerald-500',
    emptyText: 'No resolved messages',
  },
  // --- Triage axis (pre-lifecycle classification) ---
  {
    id: 'not_analysed',
    axis: 'triage',
    label: 'Not Analysed',
    icon: HelpCircle,
    fixedFilters: { view: 'not_analysed' },
    accentColor: '#6b7280',
    iconClass: 'text-gray-500',
    emptyText: 'No unanalysed messages',
  },
  // Needs Routing intentionally NOT a Triage column — it has its own dedicated
  // full-page view (NeedsRoutingPage) + sidebar badge, and stays available as a
  // list-view Queue filter. Keeping it off the board declutters Triage to the
  // spam/analysis classifications that actually belong on the kanban.
  {
    id: 'suspicious',
    axis: 'triage',
    label: 'Suspicious',
    icon: ShieldAlert,
    fixedFilters: { view: 'suspicious' },
    accentColor: '#a855f7',
    iconClass: 'text-purple-500',
    emptyText: 'No suspicious messages',
  },
  {
    id: 'archived',
    axis: 'triage',
    label: 'Archived',
    icon: Archive,
    // Transactional notification noise (Google alerts, delivery receipts, reports)
    // that not_analysed hides. Visible here so a mis-classified real inbound request
    // can be found & rescued. Orphan-outgoing (own sent mail) is NOT here — see BE.
    fixedFilters: { view: 'archived' },
    accentColor: '#64748b',
    iconClass: 'text-slate-500',
    emptyText: 'Nothing archived',
  },
  {
    id: 'spam',
    axis: 'triage',
    label: 'Spam',
    icon: Ban,
    fixedFilters: { showSpam: 'true' },
    accentColor: '#ef4444',
    iconClass: 'text-red-500',
    emptyText: 'No spam messages',
  },
];

// Badge shown on a kanban card = its COLUMN's lifecycle state, not the raw DB
// status. The columns are derived lifecycle buckets that legitimately cross raw
// statuses (e.g. an `in_progress` thread we replied to lands in Pending), so a
// raw-status badge contradicts the column it sits in. Keyed by column id; only
// lifecycle columns have one — triage columns (not_analysed/suspicious/archived/
// spam) show their signal badges instead, so they map to nothing here.
export const LIFECYCLE_COLUMN_BADGE: Record<string, { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-slate-500/15 text-slate-700 dark:text-slate-300' },
  in_progress: { label: 'In Progress', className: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' },
  awaiting: { label: 'Pending', className: 'bg-orange-500/15 text-orange-700 dark:text-orange-300' },
  on_hold: { label: 'On-hold', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  resolved: { label: 'Resolved', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
};

// Special drop target on the Triage tab: approve a triaged message → it leaves triage
// and enters the lifecycle at "Open". Not a column (the lifecycle board is another tab).
export const APPROVE_TARGET = 'approve_inbox';

// Cards that can be dragged (drag sources).
export const DRAGGABLE_COLS = new Set(['resolved', 'not_analysed', 'suspicious', 'spam', 'archived']);
// Columns that can receive a drop (drop targets). APPROVE_TARGET is handled separately.
export const DROPPABLE_COLS = new Set(['open', 'spam']);

// Valid drop targets per source column (+ APPROVE_TARGET). Cross-axis transitions
// (approve) only happen on the Triage tab via the APPROVE_TARGET zone; lifecycle-tab
// drag is limited to reopen (resolved → open).
export const VALID_TARGETS: Record<string, Set<string>> = {
  resolved: new Set(['open']), // reopen
  not_analysed: new Set(['spam', APPROVE_TARGET]),
  suspicious: new Set(['spam', APPROVE_TARGET]),
  spam: new Set([APPROVE_TARGET]), // approve = "not spam"
  archived: new Set(['spam', APPROVE_TARGET]), // rescue a mis-archived real request, or hard-classify as spam
};

export type DndAction = 'approve' | 'move_to_spam' | 'reopen';

export function getDndAction(from: string, to: string): DndAction | null {
  if (from === 'resolved' && to === 'open') return 'reopen';
  if (
    to === APPROVE_TARGET &&
    (from === 'not_analysed' || from === 'suspicious' || from === 'spam' || from === 'archived')
  )
    return 'approve';
  if (
    to === 'spam' &&
    (from === 'not_analysed' || from === 'suspicious' || from === 'archived')
  )
    return 'move_to_spam';
  return null;
}
