import { useCallback, useEffect, useMemo, useState } from 'react';
import { Brain } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { RuleEditor } from '@/components/shared/RuleEditor';
import DepartmentBadge from '@/components/admin/DepartmentBadge';
import { useRuleManagement } from '@/hooks/useRuleManagement';
import { getApiErrorMessage, getErrorStatus } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { departmentService, type Department } from '@/services/department.service';
import {
  ROUTING_RULE_TYPES,
  routingRuleService,
  type RoutingRule,
  type RoutingRuleType,
} from '@/services/routingRule.service';
import { AcceptFromRulesDialog, RoutingRuleLifecycleBadges } from './RoutingRuleLifecycleBadges';
import { FeatureSuggestions } from './FeatureSuggestions';
import {
  RULE_FILTERS,
  RULE_FILTER_LABEL,
  matchesFilter,
  switchOnIsAccept,
  type RuleFilter,
} from './routingRuleLifecycle';

type FormData = {
  departmentId: number | null;
  type: RoutingRuleType;
  value: string;
  exampleText: string;
  weight: number;
  enabled: boolean;
};

type RoutingRuleView = RoutingRule & {
  name: string;
  description: string;
  pattern: string;
  active: boolean;
  departmentName: string;
};

const RULE_TYPE_OPTIONS = ROUTING_RULE_TYPES.map((type) => ({
  value: type,
  label: type
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' '),
}));

const initialFormData = (): FormData => ({
  departmentId: null,
  type: 'subject_contains',
  value: '',
  exampleText: '',
  weight: 5,
  enabled: true,
});

const valuePlaceholder = (type: RoutingRuleType): string => {
  switch (type) {
    case 'subject_contains':
    case 'body_contains':
      return 'invoice billing';
    case 'subject_regex':
      return '^\\[URGENT\\]';
    case 'sender_email':
      return 'support@example.com';
    case 'sender_domain':
      return 'example.com';
    case 'header_match':
      return '{"name":"X-Priority","pattern":"^1$"}';
  }
};

const validateValue = (type: RoutingRuleType, value: string): string | null => {
  if (!value.trim()) return 'Value is required';
  if (value.length > 500) return 'Value must be 500 characters or less';
  if (type === 'subject_regex') {
    try {
      new RegExp(value);
    } catch {
      return 'Invalid regular expression';
    }
  }
  if (type === 'header_match') {
    try {
      const parsed = JSON.parse(value) as { name?: unknown; pattern?: unknown };
      if (typeof parsed.name !== 'string' || typeof parsed.pattern !== 'string') {
        return 'header_match must be JSON {"name":"...","pattern":"..."}';
      }
      new RegExp(parsed.pattern);
    } catch {
      return 'Invalid JSON or regex in header_match';
    }
  }
  return null;
};

const formatLastMatched = (iso: string | null): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
};

const prettifyPattern = (type: RoutingRuleType, value: string): string => {
  if (!value) return '';
  if (type === 'subject_regex' || type === 'body_contains' || type === 'subject_contains') {
    const wrapped = value.match(/^\\b\(([^)]+)\)\\b$/);
    const inner = wrapped ? wrapped[1] : value;
    if (/^[\w\s-]+(\|[\w\s-]+)*$/.test(inner)) {
      return inner
        .split('|')
        .map((part) => part.trim())
        .filter(Boolean)
        .join(', ');
    }
  }
  if (type === 'header_match') {
    try {
      const parsed = JSON.parse(value) as { name?: unknown; pattern?: unknown };
      if (typeof parsed.name === 'string' && typeof parsed.pattern === 'string') {
        return `${parsed.name} = ${parsed.pattern}`;
      }
    } catch {
      // fall through to raw value
    }
  }
  return value;
};

export const RoutingRulesSettings = () => {
  const [allDepts, setAllDepts] = useState<Department[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [ruleFilter, setRuleFilter] = useState<RuleFilter>('all');
  const [savingDefault, setSavingDefault] = useState(false);

  const deptNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const dept of allDepts) map.set(dept.id, dept.name);
    return map;
  }, [allDepts]);

  const loadDepts = useCallback(async () => {
    try {
      setAllDepts(await departmentService.getAll());
    } catch (err: unknown) {
      logger.error('Failed to load departments:', err);
    }
  }, []);

  useEffect(() => {
    void loadDepts();
  }, [loadDepts]);

  const defaultDept = useMemo(() => allDepts.find((dept) => dept.isDefault) ?? null, [allDepts]);

  const handleSetDefault = useCallback(
    async (value: string) => {
      const id = parseInt(value, 10);
      if (!id || id === defaultDept?.id) return;
      setSavingDefault(true);
      try {
        await departmentService.setDefault(id);
        await loadDepts();
      } catch (err: unknown) {
        logger.error('Failed to set default department:', err);
      } finally {
        setSavingDefault(false);
      }
    },
    [defaultDept, loadDepts]
  );

  const adaptRule = useCallback(
    (rule: RoutingRule): RoutingRuleView => ({
      ...rule,
      name: rule.type.replace(/_/g, ' '),
      description: rule.exampleText ?? '',
      pattern: prettifyPattern(rule.type, rule.value),
      active: rule.enabled,
      departmentName: deptNameById.get(rule.departmentId) ?? String(rule.departmentId),
    }),
    [deptNameById]
  );

  const ruleManagement = useRuleManagement<RoutingRuleView, FormData>({
    fetchRules: async () => {
      const response = await routingRuleService.list();
      return (response.data ?? []).map(adaptRule);
    },
    createRule: async (data) => {
      if (data.departmentId === null) {
        setFormError('Pick a department for the rule');
        throw new Error('Missing department');
      }
      const shouldTrim = data.type !== 'subject_regex' && data.type !== 'header_match';
      const normalizedValue = shouldTrim ? data.value.trim() : data.value;
      const validationError = validateValue(data.type, normalizedValue);
      if (validationError) {
        setFormError(validationError);
        throw new Error(validationError);
      }
      setFormError(null);
      const trimmedExample = data.exampleText.trim();
      const response = await routingRuleService.create({
        departmentId: data.departmentId,
        type: data.type,
        value: normalizedValue,
        weight: data.weight,
        enabled: data.enabled,
        ...(trimmedExample.length > 0 && { exampleText: trimmedExample }),
      });
      if (!response.data) throw new Error('Create failed');
      return adaptRule(response.data);
    },
    updateRule: async (id, data) => {
      const shouldTrim = data.type !== 'subject_regex' && data.type !== 'header_match';
      const normalizedValue = shouldTrim ? data.value.trim() : data.value;
      const validationError = validateValue(data.type, normalizedValue);
      if (validationError) {
        setFormError(validationError);
        throw new Error(validationError);
      }
      setFormError(null);
      const trimmedExample = data.exampleText.trim();
      try {
        const response = await routingRuleService.update(id, {
          type: data.type,
          value: normalizedValue,
          weight: data.weight,
          enabled: data.enabled,
          exampleText: trimmedExample.length > 0 ? trimmedExample : null,
          // The department the dialog shows is the one saved (B-H1): a move is a move.
          ...(data.departmentId !== null ? { departmentId: data.departmentId } : {}),
        });
        if (!response.data) throw new Error('Update failed');
        return adaptRule(response.data);
      } catch (err) {
        // D5: on a dormant rule switched on, the BE saves the field edits first and then Accept
        // may answer 409 (routingRulesRoutes.ts PATCH). But the field write itself also answers
        // 409 when the edit would duplicate another rule, and then nothing is saved. Re-read the
        // rule: only when it holds what was submitted were the edits saved.
        const before = ruleManagement.rules.find((rule) => rule.id === id);
        if (getErrorStatus(err) !== 409 || !data.enabled || !before || !switchOnIsAccept(before)) {
          throw err;
        }
        const saved = (await routingRuleService.list()).data?.find((rule) => rule.id === id);
        const editsSaved =
          saved !== undefined &&
          saved.type === data.type &&
          saved.value === normalizedValue &&
          saved.weight === data.weight &&
          (data.departmentId === null || saved.departmentId === data.departmentId);
        if (!editsSaved) {
          setFormError(getApiErrorMessage(err) ?? 'The rule could not be saved.');
          throw err;
        }
        toast.failure('switch the rule on', err);
        return adaptRule(saved);
      }
    },
    deleteRule: async (id) => {
      await routingRuleService.delete(id);
    },
    getInitialFormData: initialFormData,
    getFormDataFromRule: (rule) => ({
      departmentId: rule.departmentId,
      type: rule.type,
      value: rule.value,
      exampleText: rule.exampleText ?? '',
      weight: rule.weight,
      enabled: rule.enabled,
    }),
  });

  useEffect(() => {
    setFormError(null);
  }, [ruleManagement.isCreating, ruleManagement.editingRule]);

  const [confirmRule, setConfirmRule] = useState<RoutingRuleView | null>(null);

  const switchRule = async (rule: RoutingRuleView, enabled: boolean, scope: string) => {
    try {
      await routingRuleService.update(rule.id, { enabled });
    } catch (err) {
      // A 409 names why (another department routes the pattern, the group was decided, …).
      logger.error('Failed to toggle routing rule:', err);
      toast.failure(scope, err);
    }
    await ruleManagement.loadRules();
  };

  const toggleActive = (rule: RoutingRuleView) => {
    // D5: switching on a dormant (proposed / declined / archived) rule IS Accept — ask first.
    if (switchOnIsAccept(rule)) {
      setConfirmRule(rule);
      return;
    }
    void switchRule(rule, !rule.enabled, 'update the routing rule');
  };

  const deptOptionsForDialog = useMemo(
    () =>
      allDepts.map((dept) => ({
        value: dept.id.toString(),
        label: dept.name,
      })),
    [allDepts]
  );

  const { rules } = ruleManagement;
  const countOf = (filter: RuleFilter) =>
    rules.filter((rule) => matchesFilter(rule, filter)).length;
  const filteredRules = rules.filter((rule) => matchesFilter(rule, ruleFilter));
  const editingDormant =
    ruleManagement.editingRule !== null && switchOnIsAccept(ruleManagement.editingRule);

  return (
    <div className="space-y-4">
      {/* A proposed rule (propose_rule) is decided by switching its dormant row on — not here. */}
      <FeatureSuggestions
        domains={['routing']}
        excludeTypes={['propose_rule']}
        title="Suggestions"
        description="Routing questions the engine could not settle on its own, and learned rules waiting for you to keep or drop them."
      />
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="font-display text-sm font-semibold text-foreground">Default department</h3>
        <p className="mt-1 mb-3 text-xs text-muted-foreground">
          The fallback department for incoming threads when no source binding or routing rule
          resolves one. Exactly one per workspace.
        </p>
        <div className="max-w-xs">
          <Select
            value={defaultDept ? String(defaultDept.id) : ''}
            onChange={handleSetDefault}
            options={allDepts.map((dept) => ({ value: String(dept.id), label: dept.name }))}
            placeholder={allDepts.length === 0 ? 'No departments' : 'Select default department'}
            disabled={allDepts.length === 0 || savingDefault}
            aria-label="Default department"
          />
        </div>
      </div>
      <RuleEditor<RoutingRuleView, FormData>
        {...ruleManagement}
        rules={filteredRules}
        renderFilters={() => (
          <div className="flex gap-1 p-1 rounded-lg bg-muted w-fit">
            {RULE_FILTERS.map((filter) => {
              const label = `${RULE_FILTER_LABEL[filter]} (${countOf(filter)})`;
              return (
                <Button
                  key={filter}
                  variant="ghost"
                  size="sm"
                  onClick={() => setRuleFilter(filter)}
                  className={`px-3 py-1.5 h-auto text-sm rounded-md font-medium ${ruleFilter === filter ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {filter === 'learned' && <Brain className="inline w-3 h-3 mr-1 opacity-70" />}
                  {label}
                </Button>
              );
            })}
          </div>
        )}
        title="Routing Rules"
        description="Department-scoped rules that decide which department incoming threads route to. Rules apply to all channels serving the department. Highest score wins; if nothing matches, the source default is used."
        dialogTitle="Routing Rule"
        emptyMessage="No routing rules yet. Add one to route threads by subject, sender, or header."
        prefixColumns={[
          {
            header: 'Department',
            render: (rule) => <DepartmentBadge departmentId={rule.departmentId} size="sm" />,
          },
          {
            header: 'Type',
            render: (rule) => (
              <div className="flex items-center gap-1.5">
                <Badge variant="secondary" className="capitalize">
                  {rule.type.replace(/_/g, ' ')}
                </Badge>
                <RoutingRuleLifecycleBadges rule={rule} />
              </div>
            ),
          },
        ]}
        suffixColumns={[
          {
            header: 'Score',
            align: 'center',
            render: (rule) => <Badge>{rule.weight}</Badge>,
          },
          {
            header: 'Matches',
            align: 'center',
            render: (rule) => <span className="text-muted-foreground">{rule.matchCount}</span>,
          },
          {
            header: 'Last Match',
            render: (rule) => (
              <span className="font-mono text-muted-foreground whitespace-nowrap">
                {formatLastMatched(rule.lastMatchedAt)}
              </span>
            ),
          },
        ]}
        renderMobileExtra={(rule) => (
          <>
            <Badge>{rule.weight}</Badge>
            <span className="text-xs text-muted-foreground">
              {rule.matchCount} match{rule.matchCount === 1 ? '' : 'es'}
            </span>
          </>
        )}
        renderFormFields={(formData, setFormData) => (
          <>
            <Select
              label="Department"
              value={formData.departmentId?.toString() ?? ''}
              onChange={(value) => {
                setFormData({
                  ...formData,
                  departmentId: value ? parseInt(value, 10) : null,
                });
                setFormError(null);
              }}
              options={deptOptionsForDialog}
              placeholder={allDepts.length === 0 ? 'No departments' : 'Select a department'}
              disabled={allDepts.length === 0}
            />
            {ruleManagement.editingRule !== null && (
              <p className="text-xs text-muted-foreground">
                Changing the department moves this rule to another team.
              </p>
            )}
            <Select
              label="Match Type"
              value={formData.type}
              onChange={(value) => {
                setFormData({ ...formData, type: value as RoutingRuleType });
                setFormError(null);
              }}
              options={RULE_TYPE_OPTIONS}
            />
            <div>
              <label className="block mb-1 text-sm font-medium">Value</label>
              <input
                type="text"
                value={formData.value}
                onChange={(event) => {
                  setFormData({ ...formData, value: event.target.value });
                  setFormError(null);
                }}
                className="px-3 py-2 w-full font-mono text-sm rounded-md border bg-background"
                placeholder={valuePlaceholder(formData.type)}
              />
              {formData.type === 'header_match' && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Provide JSON: <code>{`{"name":"X-Header","pattern":"regex"}`}</code>
                </p>
              )}
            </div>
            <div>
              <label className="block mb-1 text-sm font-medium">
                Example phrases{' '}
                <span className="text-muted-foreground font-normal">(optional, multilingual)</span>
              </label>
              <Textarea
                value={formData.exampleText}
                onChange={(event) => setFormData({ ...formData, exampleText: event.target.value })}
                placeholder="invoice question, payment failure, billing dispute, refund request"
                rows={2}
                maxLength={1000}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Natural-language examples — embedded for semantic matching so messages in any
                language that mean the same thing also route here. Leave blank to embed the pattern.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium">Score</label>
                <span className="text-sm font-medium text-foreground">{formData.weight}</span>
              </div>
              <input
                type="range"
                min="1"
                max="100"
                step="1"
                value={formData.weight}
                onChange={(event) =>
                  setFormData({ ...formData, weight: parseInt(event.target.value, 10) })
                }
                className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-muted accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>1 (Weak)</span>
                <span>100 (Strong)</span>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="checkbox"
                id="routing-rule-enabled"
                checked={formData.enabled}
                onChange={(event) => setFormData({ ...formData, enabled: event.target.checked })}
                className="rounded"
              />
              <label htmlFor="routing-rule-enabled" className="text-sm">
                Enabled
              </label>
            </div>
            {editingDormant && formData.enabled && (
              <p className="text-xs text-muted-foreground">
                Saving with Enabled on accepts the proposal: the rule starts routing mail now.
              </p>
            )}
            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </>
        )}
        isSaveDisabled={(formData) =>
          !formData.value.trim() || (ruleManagement.isCreating && formData.departmentId === null)
        }
        onToggleActive={toggleActive}
        toggleTitle={(rule) =>
          switchOnIsAccept(rule) ? 'Switching this on accepts the proposal' : undefined
        }
      />
      <AcceptFromRulesDialog
        rule={confirmRule}
        rules={rules}
        departmentName={(departmentId) =>
          deptNameById.get(departmentId) ?? `department #${departmentId}`
        }
        onCancel={() => setConfirmRule(null)}
        onAccept={(rule) => void switchRule(rule, true, 'accept the proposed rule')}
      />
    </div>
  );
};
