import { useEffect, useState } from 'react';
import { Plus, Trash2, Route } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { organizationService } from '@/services/organization.service';

type RoutingKey = { id: number; key: string; description: string | null };
type AutoAssignMode = 'off' | 'match_only' | 'always';

const AUTO_ASSIGN_OPTIONS: { value: AutoAssignMode; label: string; description: string }[] = [
  { value: 'always', label: 'Always', description: 'Skill match first, then load-balance fallback' },
  { value: 'match_only', label: 'Match only', description: 'Auto-assign only when a skill match is found' },
  { value: 'off', label: 'Off', description: 'Never auto-assign — all tickets start unassigned' },
];

export const RoutingKeysSettings = () => {
  const [routingKeys, setRoutingKeys] = useState<RoutingKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; key: string | null }>({
    open: false,
    key: null,
  });
  const [autoAssignMode, setAutoAssignMode] = useState<AutoAssignMode>('always');
  const [savingMode, setSavingMode] = useState(false);

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const [data, assignData] = await Promise.all([
        organizationService.getRoutingKeys(),
        organizationService.getAutoAssign(),
      ]);
      setRoutingKeys(data);
      setAutoAssignMode(assignData.mode);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchKeys();
  }, []);

  const handleModeChange = async (mode: AutoAssignMode) => {
    setSavingMode(true);
    try {
      await organizationService.updateAutoAssign(mode);
      setAutoAssignMode(mode);
    } finally {
      setSavingMode(false);
    }
  };

  const handleAdd = async () => {
    const key = newKey.trim().toLowerCase();
    if (!key) return;
    setSaving(true);
    try {
      await organizationService.addRoutingKey(key, newDescription.trim() || undefined);
      setNewKey('');
      setNewDescription('');
      await fetchKeys();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog.key) return;
    try {
      await organizationService.deleteRoutingKey(deleteDialog.key);
      setDeleteDialog({ open: false, key: null });
      await fetchKeys();
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">
          Define the skill attributes used for auto-routing tickets to agents. Each key (e.g.{' '}
          <span className="font-mono text-xs">language</span>,{' '}
          <span className="font-mono text-xs">region</span>,{' '}
          <span className="font-mono text-xs">expertise</span>) can be assigned values per user in
          their profile.
        </p>
      </div>

      {/* Auto-assign mode */}
      <div className="p-4 rounded-lg border border-border bg-muted/30">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Auto-assignment mode
        </p>
        <div className="flex gap-2">
          {AUTO_ASSIGN_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              disabled={savingMode}
              onClick={() => void handleModeChange(opt.value)}
              className={`flex-1 px-3 py-2 text-sm rounded-md border transition-all text-left ${
                autoAssignMode === opt.value
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/50'
              }`}
            >
              <div className="font-medium">{opt.label}</div>
              <div className="text-xs mt-0.5 text-muted-foreground">{opt.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Add new key */}
      <div className="p-4 rounded-lg border border-border bg-muted/30">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Add routing key
        </p>
        <div className="flex gap-2">
          <div className="flex flex-col gap-1">
            <input
              type="text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleAdd(); } }}
              placeholder="Key (e.g. language, region)"
              className={`w-36 px-3 py-1.5 text-sm rounded-md border bg-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary ${newKey && !/^[a-z0-9_-]+$/.test(newKey) ? 'border-destructive' : 'border-border'}`}
            />
            {newKey && !/^[a-z0-9_-]+$/.test(newKey) && (
              <span className="text-xs text-destructive">Only letters, numbers, - and _</span>
            )}
          </div>
          <input
            type="text"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleAdd(); } }}
            placeholder="Description (optional)"
            className="flex-1 px-3 py-1.5 text-sm rounded-md border bg-input text-foreground border-border placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <Button
            size="sm"
            onClick={() => void handleAdd()}
            disabled={saving || !newKey.trim() || !/^[a-z0-9_-]+$/.test(newKey)}
          >
            <Plus className="mr-1 w-4 h-4" />
            Add
          </Button>
        </div>
      </div>

      {/* Keys list */}
      {loading ? (
        <div className="py-8 text-sm text-center text-muted-foreground">Loading…</div>
      ) : routingKeys.length === 0 ? (
        <div className="py-8 text-sm text-center text-muted-foreground">
          No routing keys defined yet.
        </div>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border">
          {routingKeys.map((rk) => (
            <div key={rk.id} className="flex items-center gap-3 px-4 py-3">
              <Route className="flex-shrink-0 w-4 h-4 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <span className="font-mono text-sm font-semibold">{rk.key}</span>
                {rk.description && (
                  <span className="ml-2 text-sm text-muted-foreground">{rk.description}</span>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                onClick={() => setDeleteDialog({ open: true, key: rk.key })}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ open, key: null })}
        onConfirm={() => void handleDelete()}
        title="Delete Routing Key"
        description={
          deleteDialog.key
            ? `Delete key "${deleteDialog.key}"? All user skill values for this key will also be removed.`
            : ''
        }
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
};
