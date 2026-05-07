import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Inbox,
  Hourglass,
  MessageCircle,
  CheckCircle2,
  RotateCcw,
  ShieldAlert,
  HelpCircle,
} from 'lucide-react';
import { messageService, type MessageThread } from '@/services/message.service';
import { useAuthStore } from '@/stores/authStore';
import type { FilterState } from '@/stores/messagesStore';
import { KanbanCard } from './KanbanCard';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

type KanbanColumnDef = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  fixedFilters: Record<string, string>;
  accentColor: string;
  iconClass: string;
  emptyText: string;
};

const COLUMNS: KanbanColumnDef[] = [
  {
    id: 'active',
    label: 'Active',
    icon: Inbox,
    fixedFilters: { view: 'inbox', excludeNotAnalysed: 'true' },
    accentColor: '#3b82f6',
    iconClass: 'text-blue-500',
    emptyText: 'No active messages',
  },
  {
    id: 'not_analysed',
    label: 'Not Analysed',
    icon: HelpCircle,
    fixedFilters: { view: 'not_analysed' },
    accentColor: '#6b7280',
    iconClass: 'text-gray-500',
    emptyText: 'No unanalysed messages',
  },
  {
    id: 'suspicious',
    label: 'Suspicious',
    icon: ShieldAlert,
    fixedFilters: { view: 'suspicious' },
    accentColor: '#a855f7',
    iconClass: 'text-purple-500',
    emptyText: 'No suspicious messages',
  },
  {
    id: 'awaiting',
    label: 'Awaiting',
    icon: Hourglass,
    fixedFilters: {
      view: 'awaiting_response',
      excludeSuspicious: 'true',
      excludeNotAnalysed: 'true',
    },
    accentColor: '#f97316',
    iconClass: 'text-orange-500',
    emptyText: 'No awaiting messages',
  },
  {
    id: 'replied',
    label: 'Replied',
    icon: MessageCircle,
    fixedFilters: { view: 'client_replied', excludeSuspicious: 'true', excludeNotAnalysed: 'true' },
    accentColor: '#22c55e',
    iconClass: 'text-green-500',
    emptyText: 'No replied messages',
  },
  {
    id: 'resolved',
    label: 'Resolved',
    icon: CheckCircle2,
    // view=resolved already limits to status=resolved — no SLA exclusions needed
    // (resolved+breached threads belong here, not in BREACHED which only shows unresolved)
    fixedFilters: { view: 'resolved' },
    accentColor: '#9ca3af',
    iconClass: 'text-gray-400',
    emptyText: 'No resolved messages',
  },
];

const PAGE_SIZE = 20;

function buildSharedFilters(filters: FilterState): Record<string, string> {
  const api: Record<string, string> = {};
  if (filters.messageSourceId && filters.messageSourceId !== 'all')
    api.messageSourceId = filters.messageSourceId;
  if (filters.priority && filters.priority !== 'all') api.priority = filters.priority;
  if (filters.assigneeId && filters.assigneeId !== 'all')
    api.assigneeId = filters.assigneeId === 'unassigned' ? '0' : filters.assigneeId;
  if (filters.aiState === 'needs_review') api.needsHumanReview = 'true';
  else if (filters.aiState === 'needs_info') api.showNeedsInfo = 'true';
  else if (filters.aiState === 'ai_suggested') api.aiSuggested = 'true';
  else if (filters.aiState === 'bot_handled') api.botHandled = 'true';
  else if (filters.aiState === 'lead') api.isLead = 'true';
  else if (filters.aiState === 'contradiction') api.hasContradiction = 'true';
  if (filters.labelId && filters.labelId !== 'all') api.labelId = filters.labelId;
  if (filters.linked === 'has_ticket') api.hasTicket = 'true';
  else if (filters.linked === 'has_jira') api.hasJiraTicket = 'true';
  if (filters.search?.trim()) api.search = filters.search.trim();
  return api;
}

type ColumnState = {
  threads: MessageThread[];
  total: number;
  loading: boolean;
  hasMore: boolean;
  page: number;
};

type KanbanColumnProps = {
  col: KanbanColumnDef;
  fixedFilters: Record<string, string>;
  sharedFilters: Record<string, string>;
  filterKey: string;
  onOpen: (thread: MessageThread) => void;
};

const KanbanColumn = ({
  col,
  fixedFilters,
  sharedFilters,
  filterKey,
  onOpen,
}: KanbanColumnProps) => {
  const [state, setState] = useState<ColumnState>({
    threads: [],
    total: 0,
    loading: true,
    hasMore: false,
    page: 1,
  });

  // Always holds latest values without stale closure issues
  const sharedFiltersRef = useRef(sharedFilters);
  sharedFiltersRef.current = sharedFilters;
  const pageRef = useRef(1);

  // Reset + fetch page 1 whenever filters change
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, threads: [], page: 1 }));
    void (async () => {
      try {
        const filters = { ...sharedFiltersRef.current, ...fixedFilters };
        const res = await messageService.getThreads(filters, 1, PAGE_SIZE, 'desc');
        if (cancelled || !res.success) return;
        pageRef.current = res.pagination.page;
        setState({
          threads: res.data.filter((t) => t.latestMessage !== null),
          total: res.pagination.total,
          loading: false,
          hasMore: res.pagination.page < res.pagination.totalPages,
          page: res.pagination.page,
        });
      } catch (err) {
        if (!cancelled) {
          logger.error(`Failed to fetch kanban column ${col.id}:`, err);
          setState((s) => ({ ...s, loading: false }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // filterKey is the stable serialization of sharedFilters; col.id covers column identity.
    // fixedFilters is intentionally omitted from deps: it is derived from the module-level
    // COLUMNS constant and never changes at runtime. If dynamic per-column filters are ever
    // introduced, add fixedFilters to this array and remove the eslint-disable.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fixedFilters is always a module-level constant, never changes at runtime
  }, [filterKey, col.id]);

  const loadMore = useCallback(async () => {
    const nextPage = pageRef.current + 1;
    const filterSnapshot = { ...sharedFiltersRef.current, ...fixedFilters };
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await messageService.getThreads(filterSnapshot, nextPage, PAGE_SIZE, 'desc');
      if (!res.success) return;
      const currentFilterKey = JSON.stringify(sharedFiltersRef.current);
      const snapshotKey = JSON.stringify(filterSnapshot);
      if (currentFilterKey !== snapshotKey) return;
      pageRef.current = res.pagination.page;
      setState((s) => ({
        threads: [...s.threads, ...res.data.filter((t) => t.latestMessage !== null)],
        total: res.pagination.total,
        loading: false,
        hasMore: res.pagination.page < res.pagination.totalPages,
        page: res.pagination.page,
      }));
    } catch (err) {
      logger.error(`Failed to load more for kanban column ${col.id}:`, err);
      setState((s) => ({ ...s, loading: false }));
    }
  }, [col, fixedFilters]);

  const Icon = col.icon;

  return (
    <div
      className="flex flex-col w-full rounded-lg border-t-4 border border-border bg-muted/30 overflow-hidden md:min-w-[260px] md:max-w-[320px] md:flex-1"
      style={{ borderTopColor: col.accentColor }}
      data-column={col.id}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b bg-background">
        <Icon className={`w-4 h-4 shrink-0 ${col.iconClass}`} />
        <span className="flex-1 text-sm font-semibold">{col.label}</span>
        {!state.loading && (
          <span className="text-xs font-mono text-muted-foreground bg-muted rounded px-1.5 py-0.5">
            {state.total}
          </span>
        )}
      </div>

      {/* Cards — horizontal scroll on mobile, vertical scroll on desktop */}
      <div className="flex flex-row overflow-x-auto gap-2 p-2 md:flex-col md:overflow-x-hidden md:overflow-y-auto md:flex-1 md:max-h-[calc(100vh-280px)]">
        {state.loading && state.threads.length === 0 ? (
          Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="min-w-[260px] md:min-w-0 p-3 space-y-2 rounded-md border animate-pulse bg-card shrink-0">
              <div className="w-3/4 h-3 rounded bg-muted" />
              <div className="w-1/2 h-3 rounded bg-muted" />
            </div>
          ))
        ) : state.threads.length === 0 ? (
          <p className="py-4 px-3 text-xs text-muted-foreground md:text-center">{col.emptyText}</p>
        ) : (
          <>
            {state.threads.map((thread) => (
              <div key={thread.threadId} className="min-w-[260px] md:min-w-0 shrink-0 md:shrink">
                <KanbanCard thread={thread} onOpen={onOpen} weRepliedLast={col.id === 'awaiting'} />
              </div>
            ))}
            {state.hasMore && (
              <button
                type="button"
                disabled={state.loading}
                onClick={() => void loadMore()}
                className="flex gap-1 justify-center items-center shrink-0 px-3 py-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 md:w-full"
              >
                <RotateCcw className="w-3 h-3" />
                {state.loading ? 'Loading…' : 'Load more'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

type MessagesKanbanViewProps = {
  filters: FilterState;
  onOpen: (thread: MessageThread) => void;
};

const TOGGLEABLE_COLUMNS = new Set(['not_analysed', 'resolved']);

export const MessagesKanbanView = ({ filters, onOpen }: MessagesKanbanViewProps) => {
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(
    new Set(['not_analysed', 'resolved'])
  );

  const sharedFilters = useMemo(() => buildSharedFilters(filters), [filters]);
  const filterKey = useMemo(() => JSON.stringify(sharedFilters), [sharedFilters]);

  const toggleColumn = (id: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Sync department selection to auth store (same as list view)
  const setSelectedDepartment = useAuthStore((s) => s.setSelectedDepartment);
  useEffect(() => {
    if (filters.departmentRole && filters.departmentRole !== 'all') {
      setSelectedDepartment(filters.departmentRole);
    }
  }, [filters.departmentRole, setSelectedDepartment]);

  const visibleColumns = COLUMNS.filter((col) => !hiddenColumns.has(col.id));
  const toggleableColumns = COLUMNS.filter((col) => TOGGLEABLE_COLUMNS.has(col.id));

  return (
    <div className="space-y-3">
      {/* Column visibility toggles */}
      <div className="flex gap-2 items-center">
        <span className="text-xs text-muted-foreground">Show:</span>
        {toggleableColumns.map((col) => {
          const Icon = col.icon;
          const visible = !hiddenColumns.has(col.id);
          return (
            <button
              key={col.id}
              type="button"
              onClick={() => toggleColumn(col.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                visible
                  ? 'border-transparent bg-muted text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon
                className={cn(
                  'w-3 h-3',
                  visible && col.accentColor ? `text-${col.accentColor}` : ''
                )}
              />
              {col.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:overflow-x-auto md:gap-3 md:pb-4">
        {visibleColumns.map((col) => (
          <KanbanColumn
            key={col.id}
            col={col}
            fixedFilters={col.fixedFilters}
            sharedFilters={sharedFilters}
            filterKey={filterKey}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
};
