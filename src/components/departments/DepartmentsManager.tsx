import { useCallback, useEffect, useState } from 'react';
import { Plus, RotateCcw, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { departmentService, type Department } from '@/services/department.service';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

/**
 * Shared department management: list active departments, add new ones, set the
 * default, and remove/restore. Removal is a soft-delete that stays reversible —
 * removed departments show in a "Removed" section with a Restore button — so an
 * accidental removal is never a dead end. Used by both the onboarding wizard and
 * Settings. Guards: the default and the last remaining department can't be removed.
 */
export const DepartmentsManager = () => {
  const [active, setActive] = useState<Department[]>([]);
  const [removed, setRemoved] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
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

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    setError('');
    try {
      await departmentService.create({ name });
      setNewName('');
      await load();
    } catch (err) {
      logger.error('Failed to add department:', err);
      setError(
        removed.length > 0
          ? 'Could not add the department — the name may be in use. If you removed it earlier, use Restore below instead.'
          : 'Could not add the department. The name may already be in use.'
      );
    } finally {
      setAdding(false);
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
                  onClick={() =>
                    void run(dept.id, () => departmentService.setDefault(dept.id), 'Could not set default.')
                  }
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
                    : active.length <= 1
                      ? 'At least one department is required'
                      : 'Remove'
                }
                disabled={busyId !== null || dept.isDefault || active.length <= 1}
                onClick={() => setConfirmRemove(dept)}
                className={cn(!dept.isDefault && 'text-destructive hover:text-destructive')}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {/* Add a department */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void handleAdd();
            }
          }}
          placeholder="New department name"
          maxLength={100}
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button variant="outline" onClick={() => void handleAdd()} isLoading={adding} disabled={!newName.trim()}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add
        </Button>
      </div>

      {/* Removed (restorable) */}
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
        description="It stops receiving messages, but you can restore it from the Removed list below (or in Settings) anytime."
        confirmText="Remove"
        variant="warning"
      />
    </div>
  );
};
