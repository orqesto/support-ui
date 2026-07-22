import { useEffect, useState } from 'react';
import { useDepartmentContextKey } from '@/hooks/useDepartmentContextKey';
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
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { SearchInput } from '@/components/ui/SearchInput';
import { useDepartments } from '@/hooks/useDepartments';
import { useFilterPanel } from '@/hooks/useFilterPanel';
import { integrationsService, type Integration } from '@/services/integrations.service';
import { labelService, type Label } from '@/services/settings.service';
import type { FilterState } from '@/stores/messagesStore';
import { logger } from '@/lib/logger';
import { safeCssColor } from '@/lib/utils';

const SOURCE_GROUPS: { key: string; label: string; types: string[]; icon: React.ReactNode }[] = [
  { key: 'email', label: 'Email', types: ['email', 'gmail'], icon: <Mail className="w-3 h-3" /> },
  { key: 'telegram', label: 'Telegram', types: ['telegram'], icon: <Send className="w-3 h-3" /> },
  { key: 'widget', label: 'Widget', types: ['chat'], icon: <Monitor className="w-3 h-3" /> },
  { key: 'webform', label: 'Web Form', types: ['webform'], icon: <FileText className="w-3 h-3" /> },
];

// LIST-view single lifecycle dropdown. Maps to the BE `lifecycle` param
// (helpers/messageFilters.ts). Mutually exclusive with QUEUE_OPTIONS in the FE.
// NOTE: the `value`s are the stable BE param keys; only the LABELS follow the new
// status model — unreviewed+replied fold into "Open" (BE `lifecycle=open`),
// `awaiting` shows as "Pending" (awaiting customer), and the parked overlay
// `pending` shows as "On-hold". See .planning/status-model-rework-2026-07-09.md.
const LIFECYCLE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'awaiting', label: 'Pending' },
  { value: 'pending', label: 'On-hold' },
  // Single terminal state — `resolved` returns resolved+closed (both reopenable).
  { value: 'resolved', label: 'Resolved' },
] as const;

// LIST-view non-lifecycle classification dropdown. Maps 1:1 to the BE `queue`
// param. Mutually exclusive with LIFECYCLE_OPTIONS in the FE (picking a non-'all'
// value in one resets the other to 'all').
const QUEUE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'not_analysed', label: 'Not Analysed' },
  { value: 'archived', label: 'Archived' },
  { value: 'suspicious', label: 'Suspicious' },
  { value: 'spam', label: 'Spam' },
  // Needs Routing intentionally NOT a Queue option — it has its own dedicated
  // full-page view (NeedsRoutingPage) + sidebar badge. The BE `queue=needs_routing`
  // filter is kept for that page; it's just not offered in this dropdown.
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

// Dot color per priority for the active-filter chips.
const PRIORITY_DOT: Record<string, string> = {
  low: '#22c55e',
  medium: '#eab308',
  high: '#f97316',
  critical: '#ef4444',
};

type ActiveChip = { key: string; label: string; dot?: string; onRemove: () => void };

type MessageFiltersProps = {
  filters: FilterState;
  pendingSearch: string;
  activeFilterCount: number;
  /** Full count without kanban-mode exclusions — gates the "Clear All" enabled state */
  clearableFilterCount?: number;
  pagination: { page: number; limit: number; total: number };
  onFilterChange: (key: string, value: string | boolean) => void;
  onSearch: () => void;
  onSearchBlur: () => void;
  onClearFilters: () => void;
  setPendingSearch: (value: string) => void;
  isKanban?: boolean;
};

export const MessageFilters = ({
  filters,
  pendingSearch,
  activeFilterCount,
  clearableFilterCount = activeFilterCount,
  pagination,
  onFilterChange,
  onSearch,
  onSearchBlur,
  onClearFilters,
  setPendingSearch,
  isKanban = false,
}: MessageFiltersProps) => {
  const [messageSources, setMessageSources] = useState<Integration[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const { data: depts = [] } = useDepartments();
  const activeDepts = depts.filter((dept) => dept.active);

  useEffect(() => {
    labelService
      .getLabels()
      .then(setLabels)
      .catch(() => {});
  }, []);

  // BE `integrationsController.getAll` filters by dept via X-Department-Context.
  // Subscribe so the sources dropdown reloads when the user changes their dept
  // selection — otherwise the picker shows the previous dept's sources.
  const selectedDeptKey = useDepartmentContextKey();
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
  }, [selectedDeptKey]);

  const { showAdvancedFilters, toggleAdvancedFilters } = useFilterPanel({ filters });
  const [expanded, setExpanded] = useState(false);

  const activeGroups = SOURCE_GROUPS.filter((grp) =>
    messageSources.some((src) => grp.types.includes(src.type))
  );

  const start = (pagination.page - 1) * pagination.limit + 1;
  const end = Math.min(pagination.page * pagination.limit, pagination.total);

  // Active filters as removable chips — so what's applied is visible (and
  // droppable) without expanding the panel. Names are resolved from the loaded
  // sources/departments/labels where the filter value is an id.
  const optLabel = (opts: readonly { value: string; label: string }[], val?: string) =>
    opts.find((opt) => opt.value === val)?.label ?? val ?? '';
  const activeChips: ActiveChip[] = [];
  if (filters.messageSourceId && filters.messageSourceId !== 'all') {
    const name = messageSources.find((src) => String(src.id) === filters.messageSourceId)?.name;
    activeChips.push({ key: 'messageSourceId', label: `Source: ${name ?? '—'}`, onRemove: () => onFilterChange('messageSourceId', 'all') });
  }
  if (filters.departmentId && filters.departmentId !== 'all') {
    const name = activeDepts.find((dept) => String(dept.id) === filters.departmentId)?.name;
    activeChips.push({ key: 'departmentId', label: `Dept: ${name ?? '—'}`, onRemove: () => onFilterChange('departmentId', 'all') });
  }
  if (!isKanban && filters.lifecycle && filters.lifecycle !== 'all') {
    activeChips.push({ key: 'lifecycle', label: `Status: ${optLabel(LIFECYCLE_OPTIONS, filters.lifecycle)}`, onRemove: () => onFilterChange('lifecycle', 'all') });
  }
  if (!isKanban && filters.queue && filters.queue !== 'all') {
    activeChips.push({ key: 'queue', label: `Queue: ${optLabel(QUEUE_OPTIONS, filters.queue)}`, onRemove: () => onFilterChange('queue', 'all') });
  }
  if (isKanban && filters.threadStatus && filters.threadStatus !== 'all') {
    activeChips.push({ key: 'threadStatus', label: `Status: ${filters.threadStatus}`, onRemove: () => onFilterChange('threadStatus', 'all') });
  }
  if (filters.priority && filters.priority !== 'all') {
    activeChips.push({ key: 'priority', label: `Priority: ${optLabel(PRIORITY_OPTIONS, filters.priority)}`, dot: PRIORITY_DOT[filters.priority], onRemove: () => onFilterChange('priority', 'all') });
  }
  if (filters.assigneeId && filters.assigneeId !== 'all') {
    activeChips.push({ key: 'assigneeId', label: filters.assigneeId === 'me' ? 'Assignee: Me' : 'Assignee', onRemove: () => onFilterChange('assigneeId', 'all') });
  }
  if (filters.aiState && filters.aiState !== 'all') {
    activeChips.push({ key: 'aiState', label: `AI: ${optLabel(AI_STATE_OPTIONS, filters.aiState)}`, onRemove: () => onFilterChange('aiState', 'all') });
  }
  if (filters.labelId && filters.labelId !== 'all') {
    const name = labels.find((lab) => String(lab.id) === filters.labelId)?.name;
    activeChips.push({ key: 'labelId', label: `Label: ${name ?? '—'}`, onRemove: () => onFilterChange('labelId', 'all') });
  }
  if (filters.linked && filters.linked !== 'all') {
    activeChips.push({ key: 'linked', label: optLabel(LINKED_OPTIONS, filters.linked), onRemove: () => onFilterChange('linked', 'all') });
  }
  if (filters.search?.trim()) {
    activeChips.push({ key: 'search', label: `Search: "${filters.search.trim()}"`, onRemove: () => { onFilterChange('search', ''); setPendingSearch(''); } });
  }
  if (filters.slaBreached) {
    activeChips.push({ key: 'slaBreached', label: 'SLA Breach', dot: '#dc2626', onRemove: () => onFilterChange('slaBreached', false) });
  }
  if (filters.slaAtRisk) {
    activeChips.push({ key: 'slaAtRisk', label: 'SLA At Risk', dot: '#f59e0b', onRemove: () => onFilterChange('slaAtRisk', false) });
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        {/* Header — ONE canonical toggle (the left cluster). Pagination and
            "Clear all" live OUTSIDE it so clicking a stat can't collapse the
            panel; the hit target is just icon + Filters + count + chevron. */}
        <div className="flex gap-3 justify-between items-center">
          <button
            type="button"
            onClick={() => setExpanded((val) => !val)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse filters' : 'Expand filters'}
            className="flex gap-2.5 items-center min-w-0 cursor-pointer -mx-2 px-2 py-1.5 rounded-lg transition-colors group hover:bg-accent"
          >
            <span className="grid place-items-center w-7 h-7 rounded-lg transition-colors shrink-0 bg-accent text-foreground group-hover:bg-primary group-hover:text-primary-foreground">
              <Filter className="w-3.5 h-3.5" />
            </span>
            <span className="text-sm font-semibold">Filters</span>
            {activeFilterCount > 0 && (
              <span className="inline-flex justify-center items-center h-5 rounded-full min-w-5 px-1.5 text-[11px] font-bold tabular-nums bg-primary text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown
              className={`w-4 h-4 text-muted-foreground transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
            />
          </button>

          <div className="flex gap-2 items-center shrink-0">
            {!isKanban && pagination.total > 0 && (
              <span className="hidden text-xs whitespace-nowrap text-muted-foreground sm:inline tabular-nums">
                <b className="font-semibold text-foreground/70">
                  {start}–{end}
                </b>{' '}
                of {pagination.total}
              </span>
            )}
            {clearableFilterCount > 0 && (
              <>
                <span className="hidden w-px h-4 bg-border sm:block" />
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="flex gap-1 items-center px-2.5 h-8 rounded-lg transition-colors text-[13px] font-medium text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500"
                >
                  <X className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Clear all</span>
                </button>
              </>
            )}
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

        {/* Active-filter chips (or empty state) — always visible so what's
            applied is legible and removable without expanding the panel. */}
        {activeChips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 items-center">
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.onRemove}
                aria-label={`Remove ${chip.label}`}
                className="flex gap-1.5 items-center pr-1.5 pl-2.5 h-7 rounded-full border text-[12px] font-medium transition-colors group border-border bg-accent/40 text-foreground hover:border-rose-400/50 hover:bg-rose-500/10"
              >
                {chip.dot && (
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: chip.dot }} />
                )}
                <span className="truncate max-w-[220px]">{chip.label}</span>
                <span className="grid place-items-center w-4 h-4 rounded-full transition-colors text-muted-foreground group-hover:text-rose-500 group-hover:bg-rose-500/15">
                  <X className="w-2.5 h-2.5" />
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">
            No filters applied — showing all messages.
          </p>
        )}

        {/* Collapsible body — animated open/close (single source: `expanded`). */}
        <div
          className="overflow-hidden transition-all duration-300 ease-out"
          style={
            expanded
              ? { maxHeight: 2000, opacity: 1 }
              : { maxHeight: 0, opacity: 0, marginTop: '-1rem' }
          }
        >
          <div className="flex flex-col gap-0 pt-1 divide-y divide-border/40">
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
                    value={filters.lifecycle ?? 'all'}
                    onChange={(value) => {
                      onFilterChange('lifecycle', value);
                      // Status and Queue filter disjoint sets — enforce mutual
                      // exclusivity so we never build an empty/contradictory combo.
                      if (value !== 'all') onFilterChange('queue', 'all');
                    }}
                    options={LIFECYCLE_OPTIONS as unknown as { value: string; label: string }[]}
                    className="w-full"
                  />
                </FilterCell>
              )}

              {!isKanban && (
                <FilterCell label="Queue">
                  <ReactSelect
                    value={filters.queue ?? 'all'}
                    onChange={(value) => {
                      onFilterChange('queue', value);
                      if (value !== 'all') onFilterChange('lifecycle', 'all');
                    }}
                    options={QUEUE_OPTIONS as unknown as { value: string; label: string }[]}
                    className="w-full"
                  />
                </FilterCell>
              )}

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

              {activeDepts.length > 0 && (
                <FilterCell label="Department">
                  <ReactSelect
                    value={filters.departmentId ?? 'all'}
                    onChange={(value) => onFilterChange('departmentId', value)}
                    options={[
                      { value: 'all', label: 'All Departments' },
                      { value: 'needs_routing', label: 'Needs Routing' },
                      ...activeDepts.map((dept) => ({
                        value: dept.id.toString(),
                        label: dept.name,
                      })),
                    ]}
                    formatOptionLabel={(option) => {
                      const dept = activeDepts.find((dep) => dep.id.toString() === option.value);
                      return (
                        <div className="flex gap-2 items-center">
                          {dept?.color && (
                            <span
                              className="inline-block w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: safeCssColor(dept.color) }}
                            />
                          )}
                          <span>{option.label}</span>
                        </div>
                      );
                    }}
                    className="w-full"
                  />
                </FilterCell>
              )}
            </div>

            {/* SLA toggle pills — shown in both list and kanban; they map to the
                same slaBreached/slaAtRisk params every kanban column already sends. */}
            <div className="flex gap-2 items-center pt-1">
                <span className="text-xs font-medium text-muted-foreground shrink-0">SLA:</span>
                <button
                  type="button"
                  onClick={() => onFilterChange('slaBreached', !filters.slaBreached)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    filters.slaBreached
                      ? 'bg-red-600 border-red-600 text-white'
                      : 'border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40'
                  }`}
                >
                  <AlertTriangle className="w-3 h-3" />
                  SLA Breach
                </button>
                <button
                  type="button"
                  onClick={() => onFilterChange('slaAtRisk', !filters.slaAtRisk)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    filters.slaAtRisk
                      ? 'bg-amber-500 border-amber-500 text-white'
                      : 'border-amber-400 text-amber-600 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/40'
                  }`}
                >
                  <AlertCircle className="w-3 h-3" />
                  SLA At Risk
                </button>
            </div>
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
          <div className="flex flex-col gap-2 pt-3 pb-1 sm:flex-row sm:items-center sm:justify-end">
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
        </div>
        {/* end collapsible body */}
      </CardContent>

      {/* Convenience collapse — sits flush at the CARD's bottom edge. It's
          OUTSIDE CardContent and the wrapper's -mx-4/-mb-4 cancel the Card's own
          p-4 (auto-width div full-bleeds correctly where a w-full button would
          just shift). Only shown when open, so there's no competing second
          toggle when collapsed — the header is the single entry point. */}
      {expanded && (
        <div className="-mx-4 -mb-4">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-expanded={true}
            aria-label="Collapse filters"
            className="flex gap-1.5 justify-center items-center py-2.5 w-full border-t transition-colors cursor-pointer rounded-b-lg text-[11px] font-semibold tracking-wider uppercase border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronDown className="w-3.5 h-3.5 rotate-180" />
            Collapse
          </button>
        </div>
      )}
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
