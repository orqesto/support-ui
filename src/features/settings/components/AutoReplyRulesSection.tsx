import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Plus, Tags, Trash2, X } from 'lucide-react';
import type { AlertState } from '@/features/settings/components/integrations/types';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Disclosure } from '@/components/ui/Disclosure';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Toggle } from '@/components/ui/Toggle';
import { usePermissions } from '@/hooks/usePermissions';
import { useRuleCheckAi } from '@/features/settings/hooks/useRuleCheckAi';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { AI_KEY_SETTINGS_PATH } from '@/lib/starterAllowance';
import {
  autoReplyRulesService,
  ruleErrorFields,
  ruleErrorMessage,
  type AfterReply,
  type AutoReplyRule,
} from '@/services/autoReplyRules.service';
import { Permission } from '@/types/roles';
import {
  addKeywords,
  AFTER_REPLY_OPTIONS,
  CUSTOMER_NAME_PLACEHOLDER,
  draftKeywords,
  emptyDraft,
  errorsFromFields,
  FIRST_NAME_PLACEHOLDER,
  hasErrors,
  hasNamePlaceholder,
  HOLDING_REPLY_HELP_OFF,
  HOLDING_REPLY_HELP_ON,
  HOLDING_REPLY_LABEL,
  holdingReplyPayload,
  insertKbPlaceholder,
  insertNamePlaceholder,
  KB_ANSWER_PLACEHOLDER,
  KB_MATCH_PERCENT_DEFAULT,
  KB_MATCH_PERCENT_MAX,
  KB_MATCH_PERCENT_MIN,
  kbMatchFraction,
  validateDraft,
  type RuleDraft,
  type RuleDraftErrors,
} from './autoReplyRuleForm';
import { RuleRepliesPausedNotice } from './ruleCheckHeld';

type Props = {
  /** MANAGE_AUTO_REPLY: workspace admins and moderators. Without it the list is read-only. */
  canManage: boolean;
  /** The workspace's Auto-Reply switch (the Default row): rules send nothing while it is off. */
  autoReplyEnabled: boolean;
  /** Teams on: the mailbox panel is "Teams and automatic replies"; off: "Automatic replies". */
  teamsEnabled?: boolean;
  onShowAlert: (alert: AlertState) => void;
};

type Editing = {
  ruleId: number | null;
  draft: RuleDraft;
  errors: RuleDraftErrors;
  /** The rule's stored "After the reply": an update sends the field only when it changed. */
  savedAfterReply?: AfterReply;
  /** The rule's stored "Holding reply": an update sends the field only when it changed. */
  savedHoldingReply?: boolean;
};

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
          Matches whole words in the subject or the message, in any letter case, and words that
          continue them (refund → refunds, возврат → возврата). A word whose ending changes (почта →
          почты) needs that form too. Add the word in each language your customers write in. A
          keyword needs at least 3 characters (an acronym in capitals, like TV, is fine) and must
          not be a word most emails contain (order, hello, заказ): a rule replies on its own. Use a
          specific word or a phrase ("order status").
        </p>
      </div>
      <div className="space-y-2">
        <Toggle
          checked={draft.useKnowledgeBase}
          disabled={saving}
          label="Add an answer from the knowledge base"
          ariaDescribedBy="auto-reply-rule-kb-help"
          onChange={(next) => onChange({ ...draft, useKnowledgeBase: next })}
        />
        <p id="auto-reply-rule-kb-help" className="text-xs text-muted-foreground">
          {draft.useKnowledgeBase ? (
            <>
              The reply text is a template: the answer goes where{' '}
              <code>{KB_ANSWER_PLACEHOLDER}</code> stands, or after the text. It is sent only when
              the question matches the knowledge base at least as closely as the match set under
              Advanced; otherwise nothing is sent and the email stays with the team.
            </>
          ) : (
            'Off: the reply text is sent exactly as written.'
          )}
        </p>
      </div>
      {draft.useKnowledgeBase && (
        <Disclosure
          title="Advanced"
          summary={`Match strictness: ${
            draft.kbMatchPercent.trim() === String(KB_MATCH_PERCENT_DEFAULT) ? 'standard' : 'custom'
          }`}
          openOnce={!!errors.kbMinSimilarity}
        >
          <div className="space-y-1 max-w-xs">
            <Input
              label="Knowledge base match (%)"
              type="number"
              inputMode="numeric"
              min={KB_MATCH_PERCENT_MIN}
              max={KB_MATCH_PERCENT_MAX}
              step={1}
              value={draft.kbMatchPercent}
              error={errors.kbMinSimilarity}
              disabled={saving}
              onChange={(ev) => onChange({ ...draft, kbMatchPercent: ev.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              How closely the question must match an answer in the knowledge base (
              {KB_MATCH_PERCENT_MIN}–{KB_MATCH_PERCENT_MAX}%, default {KB_MATCH_PERCENT_DEFAULT}).
              Lower answers more paraphrased questions; higher answers only close wordings.
            </p>
          </div>
        </Disclosure>
      )}
      <Textarea
        label={draft.useKnowledgeBase ? 'Reply template' : 'Reply text'}
        placeholder={
          draft.useKnowledgeBase
            ? `Hello,\n\n${KB_ANSWER_PLACEHOLDER}\n\nKind regards`
            : 'The reply the customer gets'
        }
        rows={5}
        value={draft.replyText}
        error={errors.replyText}
        disabled={saving}
        onChange={(ev) => onChange({ ...draft, replyText: ev.target.value })}
      />
      <p className="text-xs text-muted-foreground" data-testid="auto-reply-rule-placeholders">
        To greet the customer by name, use <code>{CUSTOMER_NAME_PLACEHOLDER}</code>{' '}
        (&quot;customer&quot; when the name is unknown; <code>{'{{customer_name|there}}'}</code>{' '}
        uses your own word) or <code>{FIRST_NAME_PLACEHOLDER}</code> for the first name, and{' '}
        <code>{'{thread_id}'}</code> for the thread&apos;s number. A rule&apos;s reply is not sent
        by an agent, so agent placeholders cannot be used, nor <code>{'{ticket_id}'}</code> (the
        first email has no ticket yet).
      </p>
      <div className="flex flex-wrap gap-2">
        {!hasNamePlaceholder(draft.replyText) && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() =>
              onChange({ ...draft, replyText: insertNamePlaceholder(draft.replyText) })
            }
          >
            <Plus className="mr-1 w-3 h-3" />
            Insert {CUSTOMER_NAME_PLACEHOLDER}
          </Button>
        )}
        {draft.useKnowledgeBase && !draft.replyText.includes(KB_ANSWER_PLACEHOLDER) && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => onChange({ ...draft, replyText: insertKbPlaceholder(draft.replyText) })}
          >
            <Plus className="mr-1 w-3 h-3" />
            Insert {KB_ANSWER_PLACEHOLDER}
          </Button>
        )}
      </div>
      <div className="max-w-xs">
        <Select
          label="After the reply"
          options={AFTER_REPLY_OPTIONS}
          value={draft.afterReply}
          error={errors.afterReply}
          hint={AFTER_REPLY_OPTIONS.find((option) => option.value === draft.afterReply)?.help}
          disabled={saving}
          onChange={(next) =>
            onChange({ ...draft, afterReply: next === 'pending' ? 'pending' : 'resolve' })
          }
        />
      </div>
      <div className="space-y-1">
        <Toggle
          checked={draft.holdingReply}
          disabled={saving}
          label={HOLDING_REPLY_LABEL}
          ariaDescribedBy="auto-reply-rule-holding-help"
          onChange={(next) => onChange({ ...draft, holdingReply: next })}
        />
        <p id="auto-reply-rule-holding-help" className="text-xs text-muted-foreground">
          {draft.holdingReply ? HOLDING_REPLY_HELP_ON : HOLDING_REPLY_HELP_OFF}
        </p>
        {errors.holdingReply && (
          <p className="text-xs text-destructive" role="alert">
            {errors.holdingReply}
          </p>
        )}
      </div>
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

/**
 * The meaning check every keyword rule's reply passes (BE ruleMeaningCheck / keywordSendGate): run
 * by the workspace's AI provider; with none set up, or when it cannot run, the reply is held
 * (`question_unchecked`).
 */
export const RULE_CHECK_NOTE =
  "Before a rule's reply is sent, your workspace's AI provider checks that the customer asks what the rule answers and not about a restricted topic. When no AI provider is set up, or the check cannot run, the reply is held for a person and not sent.";

/**
 * Shown when a switched-on rule could reply but the workspace has no AI provider: the meaning check
 * cannot run, so the backend holds every rule reply (`question_unchecked`) and none is sent.
 */
export const NO_AI_PROVIDER_WARNING =
  'No AI provider is set up. Every keyword rule reply is checked by AI before it is sent, so until a provider is set up no rule reply is sent: each one is held for a person.';
/** A provider is switched on, but its key or settings are missing or cannot be read: the same hold. */
export const UNUSABLE_AI_PROVIDER_WARNING =
  'The AI provider set up for this workspace cannot be used: its key or settings are missing or could not be read. Every keyword rule reply is checked by AI before it is sent, so until this is fixed no rule reply is sent: each one is held for a person.';

export const AutoReplyRulesSection = ({
  canManage,
  autoReplyEnabled,
  teamsEnabled = true,
  onShowAlert,
}: Props) => {
  const [rules, setRules] = useState<AutoReplyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyRuleId, setBusyRuleId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<AutoReplyRule | null>(null);
  // Nothing is claimed on an unknown (loading, a failed request, a backend that could not tell).
  const { ai: ruleCheckAi, heldReason } = useRuleCheckAi();
  const { hasPermission } = usePermissions();
  const rulesCouldSend = autoReplyEnabled && rules.some((rule) => rule.enabled);
  const noAiForRules = rulesCouldSend && (ruleCheckAi === 'none' || ruleCheckAi === 'unusable');
  // The AI is usable, but the workspace's AI is paused (a standing state the backend names): the
  // check of every rule reply is refused. Never together with the warning above — `heldReason`
  // is only set for a usable AI.
  // A positive test: anything but a reason in words (an unknown shape included) is not a hold.
  const aiPausedForRules = rulesCouldSend && typeof heldReason === 'string';

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
        useKnowledgeBase: rule.useKnowledgeBase,
        kbMatchPercent: String(Math.round(rule.kbMinSimilarity * 100)),
        afterReply: rule.afterReply,
        holdingReply: rule.holdingReply,
      },
      errors: {},
      savedAfterReply: rule.afterReply,
      savedHoldingReply: rule.holdingReply,
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
      useKnowledgeBase: editing.draft.useKnowledgeBase,
      // Sent only for a Template + KB rule: a plain rule keeps whatever it has stored.
      ...(editing.draft.useKnowledgeBase && {
        kbMinSimilarity: kbMatchFraction(editing.draft.kbMatchPercent),
      }),
      // A new rule says it; an edit sends it only when the admin changed it (an older backend
      // without the field then sees the same request as before).
      ...((editing.ruleId === null || editing.draft.afterReply !== editing.savedAfterReply) && {
        afterReply: editing.draft.afterReply,
      }),
      ...holdingReplyPayload(
        editing.draft.holdingReply,
        editing.ruleId === null ? undefined : editing.savedHoldingReply
      ),
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
      const fieldErrors = errorsFromFields(
        ruleErrorFields(err),
        ruleErrorMessage(err),
        editing.draft.replyText.trim() !== ''
      );
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
              Keyword rules (your canned replies)
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Sends a prepared reply when a new email contains one of a rule&apos;s keywords, then
              resolves it (or, if the rule says so, sets it to wait for the customer) and labels it{' '}
              <strong>autoReplied</strong>. A message that matches more than one rule gets no
              automatic reply at all, not even from the AI, so a keyword can belong to only one
              rule. Automatic replies switched off for a mailbox
              {teamsEnabled ? ' on a team' : ''} (Integrations → the mailbox →{' '}
              {teamsEnabled ? 'Teams and automatic replies' : 'Automatic replies'}) stop the rules
              for that mailbox&apos;s mail too. {RULE_CHECK_NOTE}
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
            Automatic email replies are off, so no rule sends anything. Turn on &quot;Automatic
            email replies&quot; above (or for a team) and the rules apply.
          </Alert>
        )}
        {noAiForRules && (
          // A notice that stays, with a link in it: a labelled status, not an interrupting alert.
          <Alert variant="warning" role="status" label="Keyword rule replies are held">
            {ruleCheckAi === 'unusable' ? UNUSABLE_AI_PROVIDER_WARNING : NO_AI_PROVIDER_WARNING}{' '}
            {hasPermission(Permission.MANAGE_INTEGRATIONS) ? (
              <Link to={AI_KEY_SETTINGS_PATH} className="font-medium underline">
                {ruleCheckAi === 'unusable' ? 'Check the AI provider' : 'Set up an AI provider'}
              </Link>
            ) : ruleCheckAi === 'unusable' ? (
              'Ask a workspace admin to check it.'
            ) : (
              'Ask a workspace admin to set one up.'
            )}
          </Alert>
        )}
        {aiPausedForRules && <RuleRepliesPausedNotice reason={heldReason} />}
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
                      {rule.useKnowledgeBase && (
                        <Badge variant="warning">
                          Template + KB · {Math.round(rule.kbMinSimilarity * 100)}%
                        </Badge>
                      )}
                      {rule.afterReply === 'pending' && (
                        <Badge variant="secondary">Waits for customer</Badge>
                      )}
                      {rule.holdingReply && <Badge variant="secondary">Holding reply</Badge>}
                      {!rule.enabled && <Badge variant="secondary">Off</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {rule.keywords.map((keyword) => (
                        <Badge key={keyword} variant="default">
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                    {rule.ignoredKeywords.length > 0 && (
                      <p className="text-xs text-warning">
                        Ignored, too short or too common:{' '}
                        {rule.ignoredKeywords.map((keyword) => `"${keyword}"`).join(', ')}. Edit the
                        rule and use a more specific word or a phrase.
                      </p>
                    )}
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
