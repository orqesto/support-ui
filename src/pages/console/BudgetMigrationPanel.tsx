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
import { dollarsText, fmtTokenCount, parseDollars } from '@/components/budget/budget.rules';
import { useApplyMigration, useBudgetMigration } from '@/hooks/useBudgets';
import { getApiErrorMessage } from '@/lib/errorMessages';
import type { MigrationBasis, MigrationOverrides, MigrationRow } from '@/services/budgets.service';

/**
 * Before the switch: the dry run of the AI budgets (what each group would get, from what),
 * editable per group, and Apply. Until Apply the old daily limits stay in force.
 */

const BASIS_TEXT: Record<MigrationBasis, string> = {
  plan: 'From its plan',
  none: 'No plan to base it on',
};

/** What the token-era cap was: Apply does not carry it over (the budget above replaces it). */
const OLD_CAP_TEXT: Record<NonNullable<MigrationRow['oldCap']>['basis'], string> = {
  alliance_pool: "organisation's monthly pool",
  sum_of_members: "workspaces' monthly limits, added up",
  standalone_limits: 'own monthly limits',
};

export const groupKeyOfRow = (row: MigrationRow): string =>
  row.group.kind === 'alliance' ? `a:${row.group.allianceId}` : `w:${row.group.organizationId}`;

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
    if (draft === undefined || draft.trim() === dollarsText(row.budget)) continue;
    const budget = parseDollars(draft);
    if (Number.isNaN(budget)) invalid.push(row.name);
    else overrides[key] = { budget };
  }
  const changed = Object.keys(overrides).length;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-base font-semibold">Switch to AI budgets</h3>
          <p className="text-sm text-muted-foreground">
            Current limits stay in force until you switch. Below is what each organisation and
            standalone workspace would get; change any budget before you apply.
          </p>
        </div>
        {data.note && <p className="text-sm text-muted-foreground">{data.note}</p>}
        {data.alreadyActive && (
          <Alert variant="info">The AI budgets are already switched on.</Alert>
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
              header: 'AI budget per billing period (US dollars)',
              cell: (row) => {
                const key = groupKeyOfRow(row);
                return (
                  <Input
                    type="number"
                    min={0}
                    aria-label={`AI budget for ${row.name}, dollars`}
                    placeholder="No budget"
                    value={drafts[key] ?? dollarsText(row.budget)}
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
              header: 'Old token limits (not carried over)',
              cell: (row) =>
                !row.oldCap && row.oldWorkspaceKbCaps.length === 0 ? (
                  <span className="text-sm text-muted-foreground">—</span>
                ) : (
                  <ul className="flex flex-col gap-0.5 text-sm">
                    {row.oldCap && (
                      <li>
                        {fmtTokenCount(row.oldCap.tokens)} tokens, {OLD_CAP_TEXT[row.oldCap.basis]}
                      </li>
                    )}
                    {row.oldWorkspaceKbCaps.map((limit) => (
                      <li key={limit.organizationId}>
                        {limit.name} {fmtTokenCount(limit.tokens)} tokens{' '}
                        <span className="text-warning">⚠ replaced by the money budget</span>
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
              onSuccess: () => toast.success('AI budgets are on'),
              onError: (applyError) =>
                toast.error(getApiErrorMessage(applyError) ?? 'Could not switch the budgets on.'),
            })
          }
        />
      </CardContent>
    </Card>
  );
};
