import { useEffect, useState } from 'react';
import {
  Filter,
  X,
  Brain,
  Link,
  Mail,
  Send,
  Monitor,
  FileText,
  ChevronDown,
  AlertTriangle,
  AlertCircle,
} from 'lucide-react';
import { AssigneeFilter } from '@/components/filters/AssigneeFilter';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { SearchInput } from '@/components/ui/SearchInput';
import { useFilterPanel } from '@/hooks/useFilterPanel';
import { integrationsService, type Integration } from '@/services/integrations.service';
import { labelService, type Label } from '@/services/settings.service';
import type { FilterState, SortingState } from '@/stores/messagesStore';
import { logger } from '@/lib/logger';

const SOURCE_GROUPS: { key: string; label: string; types: string[]; icon: React.ReactNode }[] = [
  { key: 'email', label: 'Email', types: ['email', 'gmail'], icon: <Mail className="w-3 h-3" /> },
  { key: 'telegram', label: 'Telegram', types: ['telegram'], icon: <Send className="w-3 h-3" /> },
  { key: 'widget', label: 'Widget', types: ['chat'], icon: <Monitor className="w-3 h-3" /> },
  { key: 'webform', label: 'Web Form', types: ['webform'], icon: <FileText className="w-3 h-3" /> },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'All (work queue)' },
  { value: 'active', label: 'Active' },
  { value: 'awaiting_response', label: 'Awaiting Response' },
  { value: 'client_replied', label: 'Client Replied' },
  { value: '__sep__', label: '─────────────', isDisabled: true },
  { value: 'suspicious', label: 'Suspicious' },
  { value: 'not_analysed', label: 'Not Analysed' },
  { value: 'spam', label: 'Spam' },
  { value: 'resolved', label: 'Resolved' },
] as const;

const THREAD_STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'pending', label: 'Pending' },
  { value: 'closed', label: 'Closed' },
] as const;

const PRIORITY_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
] as const;

const AI_STATE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'needs_review', label: 'Needs Review' },
  { value: 'needs_info', label: 'Needs Info' },
  { value: 'ai_suggested', label: 'AI Suggested' },
  { value: 'bot_handled', label: 'Bot Handled' },
  { value: 'lead', label: 'Lead' },
  { value: 'contradiction', label: 'Contradiction' },
] as const;

const LINKED_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'has_ticket', label: 'Has Ticket' },
  { value: 'has_jira', label: 'Has Jira' },
] as const;

const LINKED_TICKET_STATUS_OPTIONS = [
  { value: 'all', label: 'Any Status' },
  { value: 'pending', label: 'Pending' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
] as const;

type MessageFiltersProps = {
  filters: FilterState;
  sorting: SortingState;
  pendingSearch: string;
  activeFilterCount: number;
  /** Full count without kanban-mode exclusions — gates the "Clear All" enabled state */
  clearableFilterCount?: number;
  pagination: { page: number; limit: number; total: number };
  onFilterChange: (key: string, value: string) => void;
  onSearch: () => void;
  onSearchBlur: () => void;
  onClearFilters: () => void;
  onSortingChange: (sortOrder: 'asc' | 'desc') => void;
  setPendingSearch: (value: string) => void;
  isKanban?: boolean;
};

export const MessageFilters = ({
  filters,
  sorting,
  pendingSearch,
  activeFilterCount,
  clearableFilterCount = activeFilterCount,
  pagination,
  onFilterChange,
  onSearch,
  onSearchBlur,
  onClearFilters,
  onSortingChange,
  setPendingSearch,
  isKanban = false,
}: MessageFiltersProps) => {
  const [messageSources, setMessageSources] = useState<Integration[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);

  useEffect(() => {
    labelService
      .getLabels()
      .then(setLabels)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await integrationsService.getAll();
        if (res.success && res.data) {
          setMessageSources(
            res.data.filter((integration) => SOURCE_GROUPS.flatMap((grp) => grp.types).includes(integration.type))
          );
        }
      } catch (err) {
        logger.error('Failed to fetch message sources:', err);
      }
    };
    void load();
  }, []);

  const { showAdvancedFilters, toggleAdvancedFilters } = useFilterPanel({ filters });
  const [expanded, setExpanded] = useState(false);

  const activeGroups = SOURCE_GROUPS.filter((grp) =>
    messageSources.some((src) => grp.types.includes(src.type))
  );

  const start = (pagination.page - 1) * pagination.limit + 1;
  const end = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        {/* Header */}
        <div className="flex gap-2 justify-between items-center">
          {/* Left: icon + title + badge + count */}
          <button
            className="flex gap-2 items-center min-w-0 cursor-pointer"
            onClick={() => setExpanded((val) => !val)}
            aria-expanded={expanded}
          >
            <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-semibold">Filters</span>
            {activeFilterCount > 0 && (
              <Badge variant="default" className="text-xs shrink-0">
                {activeFilterCount}
              </Badge>
            )}
            {pagination.total > 0 && (
              <span className="hidden text-xs whitespace-nowrap text-muted-foreground sm:inline">
                {start}–{end} of {pagination.total}
              </span>
            )}
            <ChevronDown
              className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Right: count on mobile + Clear All */}
          <div className="flex gap-2 items-center shrink-0">
            {pagination.total > 0 && (
              <span className="text-xs whitespace-nowrap text-muted-foreground sm:hidden">
                {start}–{end} of {pagination.total}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearFilters}
              className="h-8"
              disabled={clearableFilterCount === 0}
            >
              <X className="mr-1 w-3 h-3" />
              <span className="hidden sm:inline">Clear All</span>
              <span className="sm:hidden">Clear</span>
            </Button>
          </div>
        </div>

        {/* Search — always visible */}
        <SearchInput
          value={pendingSearch}
          onChange={(value) => {
            setPendingSearch(value);
            // Only immediately clear the filter when the field is emptied.
            // Actual search is triggered via Enter/button (onSearch) to avoid
            // firing a full API request on every keystroke.
            if (!value.trim()) onFilterChange('search', '');
          }}
          onSearch={onSearch}
          onBlur={onSearchBlur}
          showSearchButton
          placeholder="Search by ID, email, subject, content..."
          className="w-full"
          size="sm"
        />

        {/* Collapsible body */}
        <div
          className={`${expanded ? 'flex' : 'hidden'} flex-col gap-0 divide-y divide-border/40`}
        >
          {/* ── Channel ───────────────────────────────────────────── */}
          {activeGroups.length > 0 && (
            <FilterSection label="Channel">
              <div className="grid grid-cols-1 gap-y-3 gap-x-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {activeGroups.map((group) => {
                  const groupSources = messageSources.filter((src) => group.types.includes(src.type));
                  const options = [
                    { value: 'all', label: `All ${group.label}` },
                    ...groupSources.map((src) => ({ value: src.id.toString(), label: src.name })),
                  ];
                  const activeSourceInGroup = groupSources.some(
                    (src) => src.id.toString() === filters.messageSourceId
                  );
                  const selectValue = activeSourceInGroup
                    ? (filters.messageSourceId ?? 'all')
                    : 'all';
                  return (
                    <FilterCell key={group.key} label={group.label} icon={group.icon}>
                      <ReactSelect
                        value={selectValue}
                        onChange={(value) => onFilterChange('messageSourceId', value)}
                        options={options}
                        className="w-full"
                      />
                    </FilterCell>
                  );
                })}
              </div>
            </FilterSection>
          )}

          {/* ── Queue ─────────────────────────────────────────────── */}
          <FilterSection label="Queue">
            <div className="grid grid-cols-1 gap-y-3 gap-x-4 sm:grid-cols-2 md:grid-cols-4">
              {!isKanban && (
                <FilterCell label="Status">
                  <ReactSelect
                    value={filters.status ?? 'active'}
                    onChange={(value) => onFilterChange('status', value)}
                    options={STATUS_OPTIONS as unknown as { value: string; label: string }[]}
                    className="w-full"
                  />
                </FilterCell>
              )}

              <FilterCell label="Thread Status">
                <ReactSelect
                  value={filters.threadStatus ?? 'all'}
                  onChange={(value) => onFilterChange('threadStatus', value)}
                  options={THREAD_STATUS_OPTIONS as unknown as { value: string; label: string }[]}
                  className="w-full"
                />
              </FilterCell>

              <FilterCell label="Priority">
                <ReactSelect
                  value={filters.priority ?? 'all'}
                  onChange={(value) => onFilterChange('priority', value)}
                  options={PRIORITY_OPTIONS as unknown as { value: string; label: string }[]}
                  formatOptionLabel={(option) => (
                    <div className="flex gap-2 items-center">
                      {option.value !== 'all' && (
                        <span
                          className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                            option.value === 'low'
                              ? 'bg-green-500'
                              : option.value === 'medium'
                                ? 'bg-amber-500'
                                : option.value === 'high'
                                  ? 'bg-orange-500'
                                  : 'bg-red-500'
                          }`}
                        />
                      )}
                      <span>{option.label}</span>
                    </div>
                  )}
                  className="w-full"
                />
              </FilterCell>

              <FilterCell label="Assignee">
                <AssigneeFilter
                  value={filters.assigneeId ?? 'all'}
                  onChange={(value) => onFilterChange('assigneeId', value)}
                  hideLabel
                  className="w-full [&>div]:w-full"
                />
              </FilterCell>
            </div>

            {/* SLA toggle pills — not shown in kanban (per-card SLA badges already visible) */}
            {!isKanban && (
              <div className="flex gap-2 items-center pt-1">
                <span className="text-xs font-medium text-muted-foreground shrink-0">SLA:</span>
                <button
                  type="button"
                  onClick={() =>
                    onFilterChange(
                      'slaFilter',
                      filters.slaFilter === 'breached' ? 'all' : 'breached'
                    )
                  }
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    filters.slaFilter === 'breached'
                      ? 'bg-red-600 border-red-600 text-white'
                      : 'border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40'
                  }`}
                >
                  <AlertTriangle className="w-3 h-3" />
                  SLA Breach
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onFilterChange('slaFilter', filters.slaFilter === 'at_risk' ? 'all' : 'at_risk')
                  }
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    filters.slaFilter === 'at_risk'
                      ? 'bg-amber-500 border-amber-500 text-white'
                      : 'border-amber-400 text-amber-600 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/40'
                  }`}
                >
                  <AlertCircle className="w-3 h-3" />
                  SLA At Risk
                </button>
              </div>
            )}
          </FilterSection>

          {/* ── Tags ──────────────────────────────────────────────── */}
          <FilterSection label="Tags">
            <div className="grid grid-cols-1 gap-y-3 gap-x-4 sm:grid-cols-2 md:grid-cols-3">
              <FilterCell label="AI State" icon={<Brain className="w-3 h-3 text-purple-500" />}>
                <ReactSelect
                  value={filters.aiState ?? 'all'}
                  onChange={(value) => onFilterChange('aiState', value)}
                  options={AI_STATE_OPTIONS as unknown as { value: string; label: string }[]}
                  className="w-full"
                />
              </FilterCell>

              {labels.length > 0 && (
                <FilterCell label="Label">
                  <ReactSelect
                    value={filters.labelId ?? 'all'}
                    onChange={(value) => onFilterChange('labelId', value)}
                    options={[
                      { value: 'all', label: 'All Labels' },
                      ...labels.map((lbl) => ({ value: lbl.id.toString(), label: lbl.name })),
                    ]}
                    formatOptionLabel={(option) => (
                      <div className="flex gap-2 items-center">
                        {option.value !== 'all' && (
                          <span
                            className="inline-block w-2 h-2 rounded-full shrink-0"
                            style={{
                              backgroundColor:
                                labels.find((lbl) => lbl.id.toString() === option.value)?.color ??
                                '#888',
                            }}
                          />
                        )}
                        <span>{option.label}</span>
                      </div>
                    )}
                    className="w-full"
                  />
                </FilterCell>
              )}

              <FilterCell label="Linked" icon={<Link className="w-3 h-3 text-blue-500" />}>
                <ReactSelect
                  value={filters.linked ?? 'all'}
                  onChange={(value) => onFilterChange('linked', value)}
                  options={LINKED_OPTIONS as unknown as { value: string; label: string }[]}
                  className="w-full"
                />
                {(filters.linked ?? 'all') !== 'all' && (
                  <ReactSelect
                    value={filters.linkedTicketStatus ?? 'all'}
                    onChange={(value) => onFilterChange('linkedTicketStatus', value)}
                    options={
                      LINKED_TICKET_STATUS_OPTIONS as unknown as { value: string; label: string }[]
                    }
                    className="mt-1 w-full"
                  />
                )}
              </FilterCell>
            </div>
          </FilterSection>

          {/* ── Footer ────────────────────────────────────────────── */}
          <div className="flex flex-col gap-2 pt-3 pb-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2 items-center">
              <span className="text-xs font-medium text-muted-foreground shrink-0">Sort:</span>
              <ReactSelect
                value={sorting.sortOrder}
                onChange={(value) => onSortingChange(value as 'asc' | 'desc')}
                options={[
                  { value: 'desc', label: 'Newest First' },
                  { value: 'asc', label: 'Oldest First' },
                ]}
                className="w-36"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleAdvancedFilters}
              className="self-start h-7 text-xs text-muted-foreground sm:self-auto"
            >
              {showAdvancedFilters ? 'Hide guide' : 'AI State guide'}
            </Button>
          </div>

          {/* AI State legend */}
          {showAdvancedFilters && (
            <div className="p-3 space-y-1.5 rounded-lg border bg-muted/10 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">AI State</p>
              <ul className="space-y-1">
                <li>
                  <span className="font-medium text-foreground">Needs Review</span> — AI flagged for
                  human attention
                </li>
                <li>
                  <span className="font-medium text-foreground">AI Suggested</span> — AI drafted a
                  reply, ready to send
                </li>
                <li>
                  <span className="font-medium text-foreground">Bot Handled</span> — AI resolved
                  autonomously
                </li>
                <li>
                  <span className="font-medium text-foreground">Lead</span> — identified as a
                  business lead
                </li>
                <li>
                  <span className="font-medium text-foreground">Contradiction</span> — client's
                  message contradicts a previous statement
                </li>
              </ul>
            </div>
          )}
        </div>
        {/* end collapsible body */}
      </CardContent>
    </Card>
  );
};

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-3 space-y-3">
      <span className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground/60">
        {label}
      </span>
      {children}
    </div>
  );
}

function FilterCell({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="flex gap-1 items-center">
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="text-xs font-medium truncate text-muted-foreground">{label}</span>
      </div>
      <div className="w-full">{children}</div>
    </div>
  );
}
