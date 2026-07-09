import {
  Inbox,
  PlayCircle,
  Hourglass,
  PauseCircle,
  CheckCircle2,
  ShieldAlert,
  HelpCircle,
  Split,
  Ban,
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
  {
    id: 'needs_routing',
    axis: 'triage',
    label: 'Needs Routing',
    icon: Split,
    fixedFilters: { view: 'needs_routing' },
    accentColor: '#0ea5e9',
    iconClass: 'text-sky-500',
    emptyText: 'Nothing needs routing',
  },
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

// Special drop target on the Triage tab: approve a triaged message → it leaves triage
// and enters the lifecycle at "Open". Not a column (the lifecycle board is another tab).
export const APPROVE_TARGET = 'approve_inbox';

// Cards that can be dragged (drag sources).
export const DRAGGABLE_COLS = new Set(['resolved', 'not_analysed', 'needs_routing', 'suspicious', 'spam']);
// Columns that can receive a drop (drop targets). APPROVE_TARGET is handled separately.
export const DROPPABLE_COLS = new Set(['open', 'spam']);

// Valid drop targets per source column (+ APPROVE_TARGET). Cross-axis transitions
// (approve) only happen on the Triage tab via the APPROVE_TARGET zone; lifecycle-tab
// drag is limited to reopen (resolved → open).
export const VALID_TARGETS: Record<string, Set<string>> = {
  resolved: new Set(['open']), // reopen
  not_analysed: new Set(['spam', APPROVE_TARGET]),
  needs_routing: new Set(['spam', APPROVE_TARGET]),
  suspicious: new Set(['spam', APPROVE_TARGET]),
  spam: new Set([APPROVE_TARGET]), // approve = "not spam"
};

export type DndAction = 'approve' | 'move_to_spam' | 'reopen';

export function getDndAction(from: string, to: string): DndAction | null {
  if (from === 'resolved' && to === 'open') return 'reopen';
  if (
    to === APPROVE_TARGET &&
    (from === 'not_analysed' || from === 'needs_routing' || from === 'suspicious' || from === 'spam')
  )
    return 'approve';
  if (
    to === 'spam' &&
    (from === 'not_analysed' || from === 'needs_routing' || from === 'suspicious')
  )
    return 'move_to_spam';
  return null;
}
