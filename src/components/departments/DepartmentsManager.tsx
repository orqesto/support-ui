import { useCallback, useEffect, useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { departmentService, type Department } from '@/services/department.service';
import { logger } from '@/lib/logger';

/**
 * Review + trim the org's departments during onboarding: remove the ones you
 * don't need and restore any you removed by mistake. Removal is a reversible
 * soft-delete (removed departments show in a "Removed" list with Restore), so an
 * accidental removal is never a dead end.
 *
 * Intentionally does NOT create departments: under the strict-cascade routing
 * model a department is only reachable once it has routing rules, so creating one
 * belongs with the rule tools in Settings, not a bare name field here. There is no
 * "default department" surfaced here — unmatched mail goes to the triage queue (not a
 * fallback department), and the per-channel default lives on the message source, not
 * on the department. Guard: the last remaining department can't be removed.
 */
export const DepartmentsManager = () => {
  const [active, setActive] = useState<Department[]>([]);
  const [removed, setRemoved] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Department | null>(null);

  const load = useCallback(async () => {
    try {
      const all = await departmentService.getAll(true);
      setActive(all.filter((dept) => dept.active));
      setRemoved(all.filter((dept) => !dept.active));
    } catch (err) {
      logger.error('Failed to load departments:', err);
      setError('Could not load departments.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (id: number, action: () => Promise<unknown>, failMsg: string) => {
    setBusyId(id);
    setError('');
    try {
      await action();
      await load();
    } catch (err) {
      logger.error(failMsg, err);
      setError(failMsg);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground">Loading departments…</div>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <ul className="divide-y divide-border rounded-md border border-border">
        {active.map((dept) => (
          <li key={dept.id} className="flex items-center justify-between gap-3 p-3">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: dept.color ?? '#94a3b8' }}
                aria-hidden
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-foreground">{dept.name}</span>
                </div>
                {dept.description && (
                  <p className="truncate text-sm text-muted-foreground">{dept.description}</p>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              title={active.length <= 1 ? 'At least one department is required' : 'Remove'}
              disabled={busyId !== null || active.length <= 1}
              onClick={() => setConfirmRemove(dept)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>

      {removed.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Removed
          </p>
          <ul className="divide-y divide-border rounded-md border border-dashed border-border">
            {removed.map((dept) => (
              <li key={dept.id} className="flex items-center justify-between gap-3 p-3">
                <span className="truncate text-sm text-muted-foreground line-through">
                  {dept.name}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busyId !== null}
                  isLoading={busyId === dept.id}
                  onClick={() =>
                    void run(dept.id, () => departmentService.reactivate(dept.id), 'Could not restore.')
                  }
                >
                  <RotateCcw className="mr-1.5 h-4 w-4" />
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={confirmRemove !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRemove(null);
        }}
        onConfirm={() => {
          if (confirmRemove) {
            void run(
              confirmRemove.id,
              () => departmentService.deactivate(confirmRemove.id),
              'Could not remove the department.'
            );
          }
        }}
        title={`Remove ${confirmRemove?.name ?? 'department'}?`}
        description="It stops receiving messages, but you can restore it from the Removed list below anytime."
        confirmText="Remove"
        variant="warning"
      />
    </div>
  );
};
