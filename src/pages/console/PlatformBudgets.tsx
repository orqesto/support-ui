import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { Progress } from '@/components/ui/Progress';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { StatusText } from '@/components/budget/StatusText';
import { fmtMoney } from '@/components/budget/budget.rules';
import { useBudgetGroups, useBudgetState } from '@/hooks/useBudgets';
import { getApiErrorMessage } from '@/lib/errorMessages';
import type { BudgetState, GroupListParams, GroupSummary } from '@/services/budgets.service';
import { BudgetAdvancedCard } from './BudgetAdvancedCard';
import { BudgetMigrationPanel } from './BudgetMigrationPanel';
import { BudgetRequestsCard } from './BudgetRequestsCard';

const PAGE_SIZE = 25;

type Sort = NonNullable<GroupListParams['sort']>;
type Filter = NonNullable<GroupListParams['filter']>;

const SORTS: Array<{ value: Sort; label: string }> = [
  { value: 'spend', label: 'Spend' },
  { value: 'name', label: 'Name' },
];

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'paused', label: 'Paused' },
  { value: 'no_limit', label: 'No bulk limit' },
  { value: 'extra', label: 'Extra running' },
  { value: 'requests', label: 'Requests' },
];

export const groupPath = (key: string) =>
  `/console/platform/ai-spend/groups/${encodeURIComponent(key)}`;

/** A small bar: bulk then live mail, as a share of the budget. */
const GroupBar = ({ group }: { group: GroupSummary }) => {
  const size = group.budget && group.budget > 0 ? group.budget : 0;
  const bulk = size ? Math.min(100, (group.spend.bulk / size) * 100) : 0;
  const live = size ? Math.min(100 - bulk, (group.spend.live / size) * 100) : 0;
  return (
    <div className="flex flex-col gap-1 min-w-[10rem]">
      <div className="flex overflow-hidden h-1.5 rounded-full bg-muted" aria-hidden="true">
        <span className="h-full bg-pending" style={{ width: `${bulk}%` }} />
        <span className="h-full bg-primary" style={{ width: `${live}%` }} />
      </div>
      <span className="font-mono text-xs text-muted-foreground">
        {fmtMoney(group.spend.total)} of {size ? fmtMoney(size) : 'no budget'}
        {group.spend.extra > 0 && ` · +${fmtMoney(group.spend.extra)} extra`}
      </span>
    </div>
  );
};

const GroupList = ({ state }: { state: BudgetState }) => {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('spend');
  const [filter, setFilter] = useState<Filter | undefined>(undefined);
  const [page, setPage] = useState(1);
  const params: GroupListParams = {
    ...(query.trim() ? { q: query.trim() } : {}),
    sort,
    ...(filter ? { filter } : {}),
    page,
    pageSize: PAGE_SIZE,
  };
  const { data, isLoading, isFetching, error, refetch } = useBudgetGroups(params);

  return (
    <div className="flex flex-col gap-4">
      {state.selfHosted && state.server && (
        <Card>
          <CardContent className="flex flex-col gap-2 p-5">
            <span className="text-sm font-medium">Server ceiling</span>
            {state.server.ceiling === null ? (
              <span className="text-sm text-muted-foreground">
                None · {fmtMoney(state.server.spend)} used this month on the whole server
              </span>
            ) : (
              <>
                <Progress
                  value={Math.min(state.server.spend, state.server.ceiling)}
                  max={state.server.ceiling}
                  variant={state.server.spend >= state.server.ceiling ? 'danger' : 'default'}
                />
                <span className="font-mono text-sm text-muted-foreground">
                  {fmtMoney(state.server.spend)} of {fmtMoney(state.server.ceiling)} this month,
                  extra included
                </span>
              </>
            )}
          </CardContent>
        </Card>
      )}
      <BudgetRequestsCard requests={state.requestList} count={state.requests} />
      {error && !data && (
        <Alert variant="danger">
          {getApiErrorMessage(error) ?? 'Could not read the budget groups.'}
        </Alert>
      )}
      <DataTable
        rows={data?.items ?? []}
        rowKey={(group) => group.key}
        search={{
          value: query,
          onChange: (next) => {
            setQuery(next);
            setPage(1);
          },
          placeholder: 'Search organisations and workspaces',
        }}
        toolbarStart={
          <div className="flex flex-wrap gap-2 items-center">
            <SegmentedControl
              ariaLabel="Sort by"
              value={sort}
              onChange={(next) => {
                setSort(next);
                setPage(1);
              }}
              segments={SORTS}
            />
            {FILTERS.map((chip) => (
              <Button
                key={chip.value}
                size="sm"
                variant={filter === chip.value ? 'primary' : 'outline'}
                aria-pressed={filter === chip.value}
                onClick={() => {
                  setFilter((current) => (current === chip.value ? undefined : chip.value));
                  setPage(1);
                }}
              >
                {chip.label}
              </Button>
            ))}
          </div>
        }
        pagination={{
          mode: 'server',
          page,
          totalPages: Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE)),
          total: data?.total ?? 0,
          limit: PAGE_SIZE,
          onPageChange: setPage,
          loading: isFetching,
        }}
        isError={Boolean(error) && Boolean(data)}
        onRetry={() => void refetch()}
        empty={{
          message: isLoading ? 'Loading…' : 'No organisation or workspace yet.',
          filteredMessage: 'Nothing matches.',
        }}
        columns={[
          {
            id: 'name',
            header: 'Organisation / workspace',
            card: 'title',
            cell: (group) => (
              <div className="flex flex-wrap gap-2 items-center">
                <Link
                  to={groupPath(group.key)}
                  className="font-medium text-primary hover:underline"
                >
                  {group.name}
                </Link>
                <Badge variant="secondary" size="sm">
                  {group.kind === 'alliance' ? 'Organisation' : 'Workspace'}
                </Badge>
                {group.mode && (
                  <Badge variant="default" size="sm">
                    {group.mode.current === 'shared' ? 'Shared AI' : 'Separate AI'}
                  </Badge>
                )}
                {group.requestCount > 0 && (
                  <Badge variant="warning" size="sm">
                    {group.requestCount} request{group.requestCount === 1 ? '' : 's'}
                  </Badge>
                )}
              </div>
            ),
          },
          { id: 'bar', header: 'This month', cell: (group) => <GroupBar group={group} /> },
          {
            id: 'status',
            header: 'Status',
            cell: (group) => (
              <StatusText
                tone={group.status.tone}
                text={group.status.text}
                testId={`budget-group-status-${group.key}`}
              />
            ),
          },
        ]}
      />
      <BudgetAdvancedCard settings={state.settings} selfHosted={state.selfHosted} />
    </div>
  );
};

/**
 * The monthly AI budgets on Platform → AI Spend, under the spend charts. An older backend (no
 * budget API) gets one line; before Apply, the switch-over panel; after it, the group list.
 * The group calls are never made before the budgets are switched on (they answer 409 then).
 */
export const PlatformBudgets = () => {
  const { data, isLoading, error } = useBudgetState();

  return (
    <section
      aria-labelledby="platform-budgets-title"
      className="flex flex-col gap-4 pt-6 mt-2 border-t border-border"
    >
      <h2 id="platform-budgets-title" className="font-display text-lg font-semibold">
        Monthly budgets
      </h2>
      {isLoading ? (
        <ConsoleLoading />
      ) : error || !data ? (
        <Alert variant="danger">
          {getApiErrorMessage(error) ?? 'Could not read the monthly budgets.'}
        </Alert>
      ) : !data.available ? (
        <p className="text-sm text-muted-foreground">Budgets need the latest server update.</p>
      ) : data.state.active ? (
        <GroupList state={data.state} />
      ) : (
        <>
          <BudgetMigrationPanel />
          {/* Before Apply too: the settings (money per message, default %) feed the dry run. */}
          <BudgetAdvancedCard settings={data.state.settings} selfHosted={data.state.selfHosted} />
        </>
      )}
    </section>
  );
};
