import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Textarea';
import { Toggle } from '@/components/ui/Toggle';
import { logger } from '@/lib/logger';
import {
  PRIORITY_LEVELS,
  PriorityRulesUnavailableError,
  priorityRuleService,
  type PriorityLevel,
  type PriorityRule,
} from '@/services/priorityRule.service';

const PRIORITY_VARIANT: Record<PriorityLevel, 'danger' | 'warning' | 'default' | 'secondary'> = {
  critical: 'danger',
  high: 'warning',
  medium: 'default',
  low: 'secondary',
};

const EMPTY_DRAFT = {
  priority: 'medium' as PriorityLevel,
  name: '',
  description: '',
  exampleText: '',
};

const isUnchanged = (rule: PriorityRule, draft: PriorityRule): boolean =>
  rule.name === draft.name &&
  rule.description === draft.description &&
  rule.exampleText === draft.exampleText &&
  rule.active === draft.active;

export const PriorityRulesSettings = () => {
  const [rules, setRules] = useState<PriorityRule[]>([]);
  const [drafts, setDrafts] = useState<Record<number, PriorityRule>>({});
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PriorityRule | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const loaded = await priorityRuleService.list();
      setRules(loaded);
      setDrafts(Object.fromEntries(loaded.map((rule) => [rule.id, { ...rule }])));
      setUnavailable(false);
    } catch (error) {
      if (error instanceof PriorityRulesUnavailableError) {
        setUnavailable(true);
      } else {
        logger.error('Failed to load priority rules:', error);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patchDraft = (ruleId: number, changes: Partial<PriorityRule>) => {
    setDrafts((current) => {
      const existing = current[ruleId];
      if (!existing) return current;
      return { ...current, [ruleId]: { ...existing, ...changes } };
    });
  };

  const save = async (ruleId: number) => {
    const next = drafts[ruleId];
    if (!next) return;
    setSavingId(ruleId);
    try {
      await priorityRuleService.update(ruleId, {
        name: next.name,
        description: next.description,
        exampleText: next.exampleText,
        active: next.active,
      });
      await load();
    } catch (error) {
      logger.error('Failed to save priority rule:', error);
    } finally {
      setSavingId(null);
    }
  };

  const create = async () => {
    setCreating(true);
    try {
      await priorityRuleService.create(draft);
      setDraft(EMPTY_DRAFT);
      setShowCreate(false);
      await load();
    } catch (error) {
      logger.error('Failed to create priority rule:', error);
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await priorityRuleService.delete(pendingDelete.id);
      await load();
    } catch (error) {
      logger.error('Failed to delete priority rule:', error);
    } finally {
      setPendingDelete(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (unavailable) {
    return (
      <Alert variant="info">
        <AlertTitle>Not available on this backend version</AlertTitle>
        <AlertDescription>
          Priority rules need a newer backend than the one this workspace is running. The
          screen will start working once the backend is updated — nothing else is required.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Alert variant="info">
        <AlertTitle>Write these as sentences, not keyword lists</AlertTitle>
        <AlertDescription>
          A message is matched against the example text by meaning, not by keyword. Write a
          few sentences that read like the real messages belonging in this tier — a
          pipe-separated list of keywords matches poorly. Priority also drives SLA timers, so
          moving a tier changes response deadlines.
        </AlertDescription>
      </Alert>

      {rules.length === 0 && (
        <Alert variant="warning">
          <AlertTitle>No priority rules configured</AlertTitle>
          <AlertDescription>
            Every incoming message will be treated as medium priority until at least one rule
            exists.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {rules.map((rule) => {
          const current = drafts[rule.id] ?? rule;
          const dirty = !isUnchanged(rule, current);

          return (
            <Card key={rule.id} padding="md">
              <div className="space-y-4">
                <div className="flex flex-wrap gap-3 justify-between items-center">
                  <div className="flex gap-3 items-center">
                    <Badge variant={PRIORITY_VARIANT[rule.priority]}>{rule.priority}</Badge>
                    {!current.active && <Badge variant="secondary">inactive</Badge>}
                  </div>
                  <div className="flex gap-3 items-center">
                    <Toggle
                      checked={current.active}
                      onChange={(next) => patchDraft(rule.id, { active: next })}
                      label="Active"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPendingDelete(rule)}
                      aria-label={`Delete ${rule.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <Input
                  label="Name"
                  value={current.name}
                  onChange={(event) => patchDraft(rule.id, { name: event.target.value })}
                />
                <Input
                  label="Description"
                  value={current.description}
                  onChange={(event) => patchDraft(rule.id, { description: event.target.value })}
                />
                <Textarea
                  label="Example text (this is what messages are compared against)"
                  rows={6}
                  value={current.exampleText}
                  onChange={(event) => patchDraft(rule.id, { exampleText: event.target.value })}
                />

                <div className="flex gap-2 justify-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!dirty || savingId === rule.id}
                    onClick={() => patchDraft(rule.id, { ...rule })}
                  >
                    Reset
                  </Button>
                  <Button
                    size="sm"
                    disabled={!dirty}
                    isLoading={savingId === rule.id}
                    onClick={() => void save(rule.id)}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {showCreate ? (
        <Card padding="md">
          <div className="space-y-4">
            <div>
              <Label htmlFor="new-priority">Priority</Label>
              <Select
                id="new-priority"
                value={draft.priority}
                onChange={(event) =>
                  setDraft({ ...draft, priority: event.target.value as PriorityLevel })
                }
              >
                {PRIORITY_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </Select>
            </div>
            <Input
              label="Name"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
            <Input
              label="Description"
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
            <Textarea
              label="Example text"
              rows={6}
              value={draft.exampleText}
              onChange={(event) => setDraft({ ...draft, exampleText: event.target.value })}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                isLoading={creating}
                disabled={!draft.name || !draft.description || !draft.exampleText}
                onClick={() => void create()}
              >
                Add rule
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 w-4 h-4" />
          Add priority rule
        </Button>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
        title="Delete priority rule?"
        description={
          pendingDelete
            ? `"${pendingDelete.name}" will be removed. Messages that would have matched it fall back to medium priority.`
            : ''
        }
        confirmText="Delete"
        variant="danger"
      />

      <p className="flex gap-2 items-start text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 w-3.5 h-3.5 shrink-0" />
        Changes take effect for messages received after saving. Existing conversations keep the
        priority they were given when they arrived.
      </p>
    </div>
  );
};
