import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { MILLION, fmtTokens } from '@/components/budget/budget.rules';
import { useApplyMigration, useBudgetMigration } from '@/hooks/useBudgets';
import { getApiErrorMessage } from '@/lib/errorMessages';
import type { MigrationBasis, MigrationOverrides, MigrationRow } from '@/services/budgets.service';

/**
 * Before the switch: the dry run of the monthly budgets (what each group would get, from what),
 * editable per group, and Apply. Until Apply the old daily limits stay in force.
 */

const BASIS_TEXT: Record<MigrationBasis, string> = {
  alliance_pool: "The organisation's monthly pool",
  sum_of_members: "Its workspaces' monthly limits, added up",
  standalone_limits: 'Its own monthly limits',
  plan: 'From its plan',
  none: 'No monthly limit before',
};

export const groupKeyOfRow = (row: MigrationRow): string =>
  row.group.kind === 'alliance' ? `a:${row.group.allianceId}` : `w:${row.group.organizationId}`;

const millionsText = (tokens: number | null) =>
  tokens === null ? '' : String(Math.round((tokens / MILLION) * 10) / 10);

/** '' = no budget; NaN = not a valid number. */
const parseMillions = (text: string): number | null => {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? Math.round(value * MILLION) : Number.NaN;
};

export const BudgetMigrationPanel = () => {
  const { data, isLoading, error } = useBudgetMigration();
  const apply = useApplyMigration();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);

  if (isLoading) return <ConsoleLoading />;
  if (error || !data)
    return (
      <Alert variant="danger">
        {getApiErrorMessage(error) ?? 'Could not read the proposed budgets.'}
      </Alert>
    );

  // Only the groups whose budget was changed here are sent as overrides.
  const overrides: MigrationOverrides = {};
  const invalid: string[] = [];
  for (const row of data.rows) {
    const key = groupKeyOfRow(row);
    const draft = drafts[key];
    if (draft === undefined || draft.trim() === millionsText(row.budget)) continue;
    const budget = parseMillions(draft);
    if (Number.isNaN(budget)) invalid.push(row.name);
    else overrides[key] = { budget };
  }
  const changed = Object.keys(overrides).length;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-base font-semibold">Switch to monthly budgets</h3>
          <p className="text-sm text-muted-foreground">
            Current limits stay in force until you switch. Below is what each organisation and
            standalone workspace would get; change any budget before you apply.
          </p>
        </div>
        {data.alreadyActive && (
          <Alert variant="info">The monthly budgets are already switched on.</Alert>
        )}
        <DataTable
          rows={data.rows}
          rowKey={groupKeyOfRow}
          pagination={{ mode: 'client', pageSize: 50 }}
          empty={{ message: 'No organisation or workspace to budget.' }}
          columns={[
            {
              id: 'group',
              header: 'Group',
              card: 'title',
              cell: (row) => (
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{row.name}</span>
                  <Badge variant="secondary" size="sm" className="w-fit">
                    {row.group.kind === 'alliance' ? 'Organisation' : 'Workspace'}
                  </Badge>
                </div>
              ),
            },
            {
              id: 'basis',
              header: 'Based on',
              cell: (row) => (
                <span className="text-sm text-muted-foreground">{BASIS_TEXT[row.basis]}</span>
              ),
            },
            {
              id: 'budget',
              header: 'Monthly budget (million tokens)',
              cell: (row) => {
                const key = groupKeyOfRow(row);
                return (
                  <Input
                    type="number"
                    min={0}
                    aria-label={`Monthly budget for ${row.name}, million tokens`}
                    placeholder="No budget"
                    value={drafts[key] ?? millionsText(row.budget)}
                    onChange={(event) =>
                      setDrafts((current) => ({ ...current, [key]: event.target.value }))
                    }
                    className="w-28 font-mono"
                    size="sm"
                  />
                );
              },
            },
            {
              id: 'bulk',
              header: 'Bulk limit',
              align: 'right',
              cell: (row) => <span className="font-mono">{row.bulkPct}%</span>,
            },
            {
              id: 'workspaces',
              header: 'Workspace limits',
              cell: (row) =>
                row.workspaceBulkLimits.length === 0 ? (
                  <span className="text-sm text-muted-foreground">—</span>
                ) : (
                  <ul className="flex flex-col gap-0.5 text-sm">
                    {row.workspaceBulkLimits.map((limit) => (
                      <li key={limit.organizationId}>
                        {limit.name} {fmtTokens(limit.from)}{' '}
                        <span className="text-warning">⚠ now limits bulk work only</span>
                      </li>
                    ))}
                  </ul>
                ),
            },
            {
              id: 'stop',
              header: '',
              cell: (row) =>
                row.wouldStopWithin7Days ? (
                  <Badge variant="warning" size="sm">
                    Would stop within 7 days
                  </Badge>
                ) : null,
            },
          ]}
        />
        {invalid.length > 0 && (
          <p className="text-sm text-destructive">
            Type a number above 0, or leave it empty for no budget: {invalid.join(', ')}.
          </p>
        )}
        <div className="flex flex-wrap gap-2.5 items-center">
          <Button
            disabled={invalid.length > 0 || apply.isPending || data.alreadyActive}
            isLoading={apply.isPending}
            onClick={() => setConfirming(true)}
          >
            Apply
          </Button>
          {changed > 0 && (
            <span className="text-sm text-muted-foreground">
              {changed} budget{changed === 1 ? '' : 's'} changed from the proposal
            </span>
          )}
        </div>
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          variant="warning"
          title="Switch to the new budgets?"
          description="Daily limits end; these numbers start now."
          confirmText="Apply"
          onConfirm={() =>
            apply.mutate(changed > 0 ? overrides : undefined, {
              onSuccess: () => toast.success('Monthly budgets are on'),
              onError: (applyError) =>
                toast.error(getApiErrorMessage(applyError) ?? 'Could not switch the budgets on.'),
            })
          }
        />
      </CardContent>
    </Card>
  );
};
