import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { Toggle } from '@/components/ui/Toggle';
import { teamBuilderService, type TeamRuleRow } from '../../services/teamBuilder.service';

const PAGE_SIZE = 50;
const SYSTEM_TEXT = 'These rules are managed by the system.';

/** Where each flow's rules are edited. response and contradiction have no page. */
const SETTINGS_LINKS: Record<string, string> = {
  spam: '/settings#rules/spam',
  detection: '/settings#rules/detection',
  routing: '/settings#rules/routing',
  priority: '/settings#rules/priority',
  categories: '/settings#organization/categories',
  sla: '/settings#organization/sla-config',
  prompts: '/settings#ai/prompts',
};

const dateOf = (iso: string | null): string => {
  const date = iso ? new Date(iso) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : 'unknown';
};

const firedText = (row: TeamRuleRow): string => {
  if (row.matchCount === null) return 'Not recorded';
  if (row.matchCount === 0) return 'Never';
  return `${row.matchCount} times, last ${dateOf(row.lastMatchedAt)}`;
};

const COLUMNS: ColumnDef<TeamRuleRow>[] = [
  { id: 'rule', header: 'Rule', cell: (row) => row.label },
  {
    id: 'active',
    header: 'On/off',
    cell: (row) =>
      row.active === null ? (
        '—'
      ) : (
        <Badge variant={row.active ? 'success' : 'secondary'}>{row.active ? 'On' : 'Off'}</Badge>
      ),
  },
  { id: 'fired', header: 'Fired', cell: firedText },
  { id: 'added', header: 'Added', cell: (row) => (row.createdAt ? dateOf(row.createdAt) : '—') },
];

type Props = { teamId: number; flow: string; counted: boolean };

/** One flow's rules on a team, with an optional "Never fired" filter and paging. */
export const TeamRulesTab = ({ teamId, flow, counted }: Props) => {
  const [neverFired, setNeverFired] = useState(false);
  const [page, setPage] = useState(1);
  const filter = counted && neverFired;
  const { data, isError, isLoading, refetch } = useQuery({
    queryKey: ['team-rules', teamId, flow, filter, page],
    queryFn: () =>
      teamBuilderService.teamRules(teamId, {
        flow,
        ...(filter ? { neverFired: true } : {}),
        page,
        pageSize: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });
  const link = SETTINGS_LINKS[flow];
  const total = data?.total ?? 0;
  return (
    <div className="space-y-3" data-testid={`team-rules-${flow}`}>
      {link ? (
        <Link to={link} className="text-sm text-primary underline">
          Edit these rules in Settings
        </Link>
      ) : (
        <Alert variant="info">{SYSTEM_TEXT}</Alert>
      )}
      <DataTable
        rows={data?.items ?? []}
        rowKey={(row) => row.id}
        columns={COLUMNS}
        isError={isError}
        onRetry={() => void refetch()}
        // Before the first answer there is nothing to say "no rules" about.
        empty={{ message: isLoading ? 'Loading rules…' : 'No rules in this flow.' }}
        toolbarStart={
          counted ? (
            <Toggle
              checked={neverFired}
              onChange={(next) => {
                setNeverFired(next);
                setPage(1);
              }}
              label="Never fired"
              ariaLabel="Never fired"
            />
          ) : undefined
        }
        pagination={{
          mode: 'server',
          page,
          totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
          total,
          limit: PAGE_SIZE,
          onPageChange: setPage,
        }}
      />
    </div>
  );
};
