import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Tags, Trash2, X } from 'lucide-react';
import type { AlertState } from '@/features/settings/components/integrations/types';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Toggle } from '@/components/ui/Toggle';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import {
  autoReplyRulesService,
  ruleErrorFields,
  type AutoReplyRule,
} from '@/services/autoReplyRules.service';
import {
  addKeywords,
  draftKeywords,
  emptyDraft,
  errorsFromFields,
  hasErrors,
  validateDraft,
  type RuleDraft,
  type RuleDraftErrors,
} from './autoReplyRuleForm';

type Props = {
  /** MANAGE_AUTO_REPLY: workspace admins and moderators. Without it the list is read-only. */
  canManage: boolean;
  /** The workspace's Auto-Reply switch (the Default row): rules send nothing while it is off. */
  autoReplyEnabled: boolean;
  onShowAlert: (alert: AlertState) => void;
};

type Editing = { ruleId: number | null; draft: RuleDraft; errors: RuleDraftErrors };

const RuleForm = ({
  editing,
  saving,
  onChange,
  onSave,
  onCancel,
}: {
  editing: Editing;
  saving: boolean;
  onChange: (draft: RuleDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}) => {
  const { draft, errors } = editing;
  const commitKeywordInput = () =>
    onChange({
      ...draft,
      keywords: addKeywords(draft.keywords, draft.keywordInput),
      keywordInput: '',
    });
  return (
    <div className="p-3 space-y-3 rounded-md border bg-muted/30" data-testid="auto-reply-rule-form">
      <Input
        label="Name (optional)"
        placeholder="e.g. Refund policy"
        value={draft.name}
        error={errors.name}
        disabled={saving}
        onChange={(ev) => onChange({ ...draft, name: ev.target.value })}
      />
      <div className="space-y-2">
        <div className="flex gap-2 items-end">
          <div className="flex-1 min-w-0">
            <Input
              label="Keywords"
              placeholder="Type a keyword and press Enter"
              value={draft.keywordInput}
              error={errors.keywords}
              disabled={saving}
              onChange={(ev) => onChange({ ...draft, keywordInput: ev.target.value })}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' || ev.key === ',') {
                  ev.preventDefault();
                  commitKeywordInput();
                }
              }}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving || !draft.keywordInput.trim()}
            onClick={commitKeywordInput}
            className={errors.keywords ? 'mb-6' : undefined}
          >
            <Plus className="mr-1 w-3 h-3" />
            Add
          </Button>
        </div>
        {draft.keywords.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Keywords">
            {draft.keywords.map((keyword) => (
              <li key={keyword}>
                <Badge variant="secondary" className="gap-1 items-center">
                  {keyword}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove keyword ${keyword}`}
                    disabled={saving}
                    onClick={() =>
                      onChange({
                        ...draft,
                        keywords: draft.keywords.filter((kw) => kw !== keyword),
                      })
                    }
                    className="p-0 ml-0.5 w-4 h-4 hover:bg-transparent"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Matches whole words in the subject or the message, in any letter case.
        </p>
      </div>
      <Textarea
        label="Reply text"
        placeholder="The reply the customer gets"
        rows={5}
        value={draft.replyText}
        error={errors.replyText}
        disabled={saving}
        onChange={(ev) => onChange({ ...draft, replyText: ev.target.value })}
      />
      <div className="flex flex-wrap gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" isLoading={saving} onClick={onSave}>
          {editing.ruleId === null ? 'Add rule' : 'Save rule'}
        </Button>
      </div>
    </div>
  );
};

export const AutoReplyRulesSection = ({ canManage, autoReplyEnabled, onShowAlert }: Props) => {
  const [rules, setRules] = useState<AutoReplyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyRuleId, setBusyRuleId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<AutoReplyRule | null>(null);

  useEffect(() => {
    let cancelled = false;
    autoReplyRulesService
      .list()
      .then((rows) => {
        if (!cancelled) setRules(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        logger.error('Failed to load auto-reply rules:', err);
        setLoadError(getApiErrorMessage(err) ?? 'Failed to load the keyword rules.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const startCreate = () => setEditing({ ruleId: null, draft: emptyDraft(), errors: {} });
  const startEdit = (rule: AutoReplyRule) =>
    setEditing({
      ruleId: rule.id,
      draft: {
        name: rule.name,
        keywords: rule.keywords,
        keywordInput: '',
        replyText: rule.replyText,
      },
      errors: {},
    });

  const save = useCallback(async () => {
    if (!editing) return;
    const errors = validateDraft(editing.draft);
    if (hasErrors(errors)) {
      setEditing({ ...editing, errors });
      return;
    }
    const payload = {
      name: editing.draft.name.trim(),
      keywords: draftKeywords(editing.draft),
      replyText: editing.draft.replyText.trim(),
    };
    setSaving(true);
    try {
      if (editing.ruleId === null) {
        const created = await autoReplyRulesService.create(payload);
        setRules((prev) => [...prev, created]);
      } else {
        const updated = await autoReplyRulesService.update(editing.ruleId, payload);
        setRules((prev) => prev.map((rule) => (rule.id === updated.id ? updated : rule)));
      }
      setEditing(null);
      onShowAlert({
        open: true,
        title: 'Saved',
        description: 'Keyword rule saved',
        variant: 'success',
      });
    } catch (err) {
      const fieldErrors = errorsFromFields(ruleErrorFields(err));
      if (hasErrors(fieldErrors)) {
        setEditing({ ...editing, errors: fieldErrors });
      } else {
        logger.error('Failed to save auto-reply rule:', err);
        onShowAlert({
          open: true,
          title: 'Save failed',
          description: getApiErrorMessage(err) ?? 'Could not save the rule.',
          variant: 'error',
        });
      }
    } finally {
      setSaving(false);
    }
  }, [editing, onShowAlert]);

  const toggle = async (rule: AutoReplyRule, enabled: boolean) => {
    setBusyRuleId(rule.id);
    try {
      const updated = await autoReplyRulesService.update(rule.id, { enabled });
      setRules((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
    } catch (err) {
      logger.error('Failed to switch auto-reply rule:', err);
      onShowAlert({
        open: true,
        title: 'Save failed',
        description: getApiErrorMessage(err) ?? 'Could not switch the rule.',
        variant: 'error',
      });
    } finally {
      setBusyRuleId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    setBusyRuleId(target.id);
    try {
      await autoReplyRulesService.remove(target.id);
      setRules((prev) => prev.filter((rule) => rule.id !== target.id));
      if (editing?.ruleId === target.id) setEditing(null);
    } catch (err) {
      logger.error('Failed to delete auto-reply rule:', err);
      onShowAlert({
        open: true,
        title: 'Delete failed',
        description: getApiErrorMessage(err) ?? 'Could not delete the rule.',
        variant: 'error',
      });
    } finally {
      setBusyRuleId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap gap-2 justify-between items-start">
          <div className="min-w-0">
            <CardTitle className="flex gap-2 items-center">
              <Tags className="w-5 h-5" />
              Keyword rules
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Sends a prepared reply when a new email contains one of a rule&apos;s keywords, then
              resolves it and labels it <strong>autoReplied</strong>. A message that matches more
              than one rule gets no auto-reply.
            </p>
          </div>
          {canManage && !editing && (
            <Button type="button" size="sm" onClick={startCreate} disabled={loading}>
              <Plus className="mr-1 w-4 h-4" />
              Add rule
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!autoReplyEnabled && (
          <Alert variant="warning">
            Auto-reply is off, so no rule sends anything. Turn on &quot;Enable auto-reply&quot;
            above (or for a team) and the rules apply.
          </Alert>
        )}
        {loadError && <Alert variant="danger">{loadError}</Alert>}
        {editing?.ruleId === null && (
          <RuleForm
            editing={editing}
            saving={saving}
            onChange={(draft) => setEditing({ ...editing, draft, errors: {} })}
            onSave={() => void save()}
            onCancel={() => setEditing(null)}
          />
        )}
        {loading ? (
          <p className="py-4 text-sm text-center text-muted-foreground">Loading rules…</p>
        ) : rules.length === 0 ? (
          editing?.ruleId !== null && (
            <p className="py-4 text-sm text-center text-muted-foreground">
              No keyword rules yet.
              {canManage ? ' Add one to answer common questions automatically.' : ''}
            </p>
          )
        ) : (
          <ul className="rounded-md border divide-y" aria-label="Keyword rules">
            {rules.map((rule) =>
              editing?.ruleId === rule.id ? (
                <li key={rule.id} className="p-2">
                  <RuleForm
                    editing={editing}
                    saving={saving}
                    onChange={(draft) => setEditing({ ...editing, draft, errors: {} })}
                    onSave={() => void save()}
                    onCancel={() => setEditing(null)}
                  />
                </li>
              ) : (
                <li
                  key={rule.id}
                  className={`flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start ${rule.enabled ? '' : 'opacity-60'}`}
                >
                  <div className="flex-1 space-y-1.5 min-w-0">
                    <div className="flex gap-2 items-center">
                      <span className="text-sm font-medium truncate">{rule.name}</span>
                      {!rule.enabled && <Badge variant="secondary">Off</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {rule.keywords.map((keyword) => (
                        <Badge key={keyword} variant="default">
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs whitespace-pre-line break-words line-clamp-2 text-muted-foreground">
                      {rule.replyText}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex gap-1 items-center shrink-0">
                      <Toggle
                        checked={rule.enabled}
                        disabled={busyRuleId === rule.id || saving}
                        ariaLabel={`${rule.enabled ? 'Turn off' : 'Turn on'} rule ${rule.name}`}
                        onChange={(next) => void toggle(rule, next)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Edit rule ${rule.name}`}
                        disabled={busyRuleId === rule.id || editing !== null}
                        onClick={() => startEdit(rule)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete rule ${rule.name}`}
                        disabled={busyRuleId === rule.id}
                        onClick={() => setDeleting(rule)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </li>
              )
            )}
          </ul>
        )}
      </CardContent>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        onConfirm={() => void confirmDelete()}
        title="Delete this rule?"
        description={
          deleting
            ? `"${deleting.name}" stops answering. Replies it already sent stay in their threads.`
            : ''
        }
        confirmText="Delete"
        variant="danger"
      />
    </Card>
  );
};
