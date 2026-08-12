import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { DeactivateDepartmentDialog } from '@/components/console/DeactivateDepartmentDialog';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import { usePermissions } from '@/hooks/usePermissions';
import {
  platformService,
  type WorkspaceDepartmentRow,
  type WorkspaceDepartmentsView,
} from '@/services/platform.service';

// The BE encodes "unlimited" (pro/enterprise/self-hosted/admin plans) as this sentinel.
const UNLIMITED = 999999;
const statusOf = (error: unknown): number | undefined =>
  (error as { status?: number } | null)?.status;
const messageOf = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

const countsSummary = (row: WorkspaceDepartmentRow): string =>
  `${row.counts.messageSources} source${row.counts.messageSources === 1 ? '' : 's'} · ` +
  `${row.counts.users} member${row.counts.users === 1 ? '' : 's'} · ` +
  `${row.counts.totalConversations} conversation${row.counts.totalConversations === 1 ? '' : 's'}`;

/**
 * Platform-console (global-admin) view for a workspace's plan-budgeted departments
 * (DEPARTMENTS-PLAN-BUDGET-SPEC §FE). Lists every department with its attachment
 * counts and the plan budget ("N of BUDGET active"), and lets a global admin activate
 * (within budget, or beyond it with an explicit override) or deactivate (rerouting a
 * non-empty department's data into a target before tombstoning it). Rendered inside
 * WorkspaceShell, which has already pointed the org context at `:orgId`.
 */
export const WorkspaceDepartmentsPage = () => {
  const { orgId } = useParams();
  const numericOrgId = orgId ? Number(orgId) : NaN;
  const { isAdmin } = usePermissions();

  const [view, setView] = useState<WorkspaceDepartmentsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [deactivateFor, setDeactivateFor] = useState<WorkspaceDepartmentRow | null>(null);
  const [overrideFor, setOverrideFor] = useState<WorkspaceDepartmentRow | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(numericOrgId)) return;
    setLoading(true);
    setError(null);
    try {
      setView(await platformService.listWorkspaceDepartments(numericOrgId));
    } catch (err) {
      setError(messageOf(err, 'Could not load departments'));
    } finally {
      setLoading(false);
    }
  }, [numericOrgId]);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const activate = async (dept: WorkspaceDepartmentRow, override: boolean) => {
    setBusyId(dept.id);
    try {
      setView(await platformService.activateWorkspaceDepartment(numericOrgId, dept.id, override));
      setOverrideFor(null);
      if (override) toast.success(`Activated “${dept.name}” beyond the plan budget`);
    } catch (err) {
      // Over budget without override → offer the explicit override confirm instead of erroring.
      if (statusOf(err) === 403 && !override) {
        setOverrideFor(dept);
      } else {
        toast.error(messageOf(err, 'Could not activate department'));
      }
    } finally {
      setBusyId(null);
    }
  };

  const confirmDeactivate = async (targetDepartmentId?: number) => {
    if (!deactivateFor) return;
    setBusyId(deactivateFor.id);
    try {
      const next = await platformService.deactivateWorkspaceDepartment(
        numericOrgId,
        deactivateFor.id,
        targetDepartmentId
      );
      setView(next);
      if (next.result.merged && next.result.counts) {
        const moved = next.result.counts;
        toast.success(
          `Merged “${deactivateFor.name}” — moved ${moved.messageSources} source(s), ` +
            `${moved.userMemberships} member(s), ${moved.conversations} conversation(s)`
        );
      } else {
        toast.success(`Deactivated “${deactivateFor.name}”`);
      }
      setDeactivateFor(null);
    } catch (err) {
      toast.error(messageOf(err, 'Could not deactivate department'));
    } finally {
      setBusyId(null);
    }
  };

  if (!isAdmin) {
    return (
      <Alert variant="warning" className="max-w-xl">
        Managing a workspace’s department budget is available to platform administrators only.
      </Alert>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-16">
        <Spinner size={22} />
      </div>
    );
  }

  if (error || !view) {
    return (
      <Alert variant="danger" className="max-w-xl">
        <div className="space-y-3">
          <p>{error ?? 'Could not load departments'}</p>
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      </Alert>
    );
  }

  const { budget, departments } = view;
  const unlimited = budget.limit >= UNLIMITED;
  const overBudget = !unlimited && budget.activeCount > budget.limit;
  // Active departments other than the one being deactivated — its merge targets.
  const targetsFor = (dept: WorkspaceDepartmentRow) =>
    departments.filter((row) => row.active && row.id !== dept.id);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex flex-wrap gap-3 items-center">
          <h1 className="text-xl font-semibold text-foreground">Departments</h1>
          <Badge variant={overBudget ? 'warning' : 'success'}>
            {unlimited
              ? `${budget.activeCount} active · unlimited`
              : `${budget.activeCount} of ${budget.limit} active`}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Each plan includes a number of active departments. Deactivating a department with data
          reroutes it into another one — nothing is lost.
        </p>
        {overBudget && (
          <Alert variant="warning" className="mt-2">
            This workspace has more active departments than its plan allows ({budget.activeCount} of{' '}
            {budget.limit}). Deactivate one (merging its data into another) to come within budget.
          </Alert>
        )}
      </header>

      <div className="space-y-2">
        {departments.map((dept) => {
          const busy = busyId === dept.id;
          return (
            <Card key={dept.id} className="flex flex-wrap gap-4 justify-between items-center p-4">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="font-medium truncate text-foreground">{dept.name}</span>
                  {dept.isDefault && <Badge variant="secondary">Default</Badge>}
                  {!dept.active && <Badge variant="warning">Inactive</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{countsSummary(dept)}</p>
              </div>

              <div className="flex flex-shrink-0 items-center">
                {dept.isDefault ? (
                  <span className="text-xs text-muted-foreground">Always active</span>
                ) : dept.active ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => setDeactivateFor(dept)}
                  >
                    Deactivate
                  </Button>
                ) : (
                  <Button size="sm" disabled={busy} onClick={() => void activate(dept, false)}>
                    {busy ? 'Working…' : 'Activate'}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <DeactivateDepartmentDialog
        open={deactivateFor !== null}
        department={deactivateFor}
        targets={deactivateFor ? targetsFor(deactivateFor) : []}
        busy={busyId !== null && busyId === deactivateFor?.id}
        onConfirm={(targetDepartmentId) => void confirmDeactivate(targetDepartmentId)}
        onClose={() => setDeactivateFor(null)}
      />

      <ConfirmDialog
        open={overrideFor !== null}
        onOpenChange={(open) => !open && setOverrideFor(null)}
        onConfirm={() => overrideFor && void activate(overrideFor, true)}
        title="Activate beyond the plan budget?"
        description={
          overrideFor
            ? `“${overrideFor.name}” would exceed this workspace's plan budget of ${budget.limit} active department(s). As a platform admin you can activate it anyway.`
            : ''
        }
        confirmText="Activate anyway"
        variant="warning"
      />
    </div>
  );
};
