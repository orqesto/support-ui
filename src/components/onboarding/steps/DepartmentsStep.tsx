import { useCallback, useEffect, useState } from 'react';
import { Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { departmentService, type Department } from '@/services/department.service';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

/**
 * Step 2 — review/trim the 6 auto-seeded departments. Remove = BE soft-delete
 * (active=false); star = org default. Guards: the default and the last
 * remaining department can't be removed.
 */
export const DepartmentsStep = () => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Department | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setDepartments(await departmentService.getAll());
    } catch (err) {
      logger.error('Failed to load departments:', err);
      setError('Could not load departments. You can manage them later in Settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSetDefault = async (dept: Department) => {
    setBusyId(dept.id);
    setError('');
    try {
      await departmentService.setDefault(dept.id);
      await load();
    } catch (err) {
      logger.error('Failed to set default department:', err);
      setError('Could not update the default department.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (dept: Department) => {
    setBusyId(dept.id);
    setError('');
    try {
      await departmentService.deactivate(dept.id);
      await load();
    } catch (err) {
      logger.error('Failed to remove department:', err);
      setError('Could not remove the department.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground">Loading departments…</div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        We set up common departments for you — incoming messages get routed to them
        automatically. Remove the ones you don&apos;t need and pick where unmatched messages
        should land (<Star className="inline h-3.5 w-3.5 -mt-0.5" /> default). You can add or
        change departments anytime in Settings.
      </p>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <ul className="divide-y divide-border rounded-md border border-border">
        {departments.map((dept) => (
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
                  {dept.isDefault && (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                      default
                    </span>
                  )}
                </div>
                {dept.description && (
                  <p className="truncate text-sm text-muted-foreground">{dept.description}</p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {!dept.isDefault && (
                <Button
                  variant="ghost"
                  size="sm"
                  title="Make default"
                  disabled={busyId !== null}
                  isLoading={busyId === dept.id}
                  onClick={() => void handleSetDefault(dept)}
                >
                  <Star className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                title={
                  dept.isDefault
                    ? 'The default department cannot be removed'
                    : departments.length <= 1
                      ? 'At least one department is required'
                      : 'Remove'
                }
                disabled={busyId !== null || dept.isDefault || departments.length <= 1}
                onClick={() => setConfirmRemove(dept)}
                className={cn(!dept.isDefault && 'text-destructive hover:text-destructive')}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={confirmRemove !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRemove(null);
        }}
        onConfirm={() => {
          if (confirmRemove) void handleRemove(confirmRemove);
        }}
        title={`Remove ${confirmRemove?.name ?? 'department'}?`}
        description="The department is deactivated and stops receiving messages. You can recreate it later in Settings."
        confirmText="Remove"
      />
    </div>
  );
};
