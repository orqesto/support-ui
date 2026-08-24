import { useState } from 'react';
import { RuleEditor } from '@/components/shared/RuleEditor';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { Textarea } from '@/components/ui/Textarea';
import { Toggle } from '@/components/ui/Toggle';
import { useRuleManagement } from '@/hooks/useRuleManagement';
import { logger } from '@/lib/logger';
import {
  PRIORITY_LEVELS,
  PriorityRulesUnavailableError,
  priorityRuleService,
  type PriorityLevel,
  type PriorityRule,
} from '@/services/priorityRule.service';

/**
 * Priority rules have no `pattern` — a message is matched against `exampleText` by
 * embedding similarity, and the `pattern` column on the table is never consulted by
 * detection. The view type maps exampleText onto `pattern` so the shared RuleEditor
 * table shows the text that actually decides the tier, rather than a blank column.
 * Same shape trick RoutingRulesSettings uses for its own view model.
 */
type PriorityRuleView = PriorityRule & { pattern: string };

type PriorityRuleFormData = {
  priority: PriorityLevel;
  name: string;
  description: string;
  exampleText: string;
  active: boolean;
};

const PRIORITY_VARIANT: Record<PriorityLevel, 'danger' | 'warning' | 'default' | 'secondary'> = {
  critical: 'danger',
  high: 'warning',
  medium: 'default',
  low: 'secondary',
};

const PRIORITY_OPTIONS = PRIORITY_LEVELS.map((level) => ({
  value: level,
  label: level.charAt(0).toUpperCase() + level.slice(1),
}));

const toView = (rule: PriorityRule): PriorityRuleView => ({ ...rule, pattern: rule.exampleText });

export const PriorityRulesSettings = () => {
  const [unavailable, setUnavailable] = useState(false);

  const ruleManagement = useRuleManagementForPriority(setUnavailable);

  const toggleActive = async (rule: PriorityRuleView) => {
    try {
      await priorityRuleService.update(rule.id, { active: !rule.active });
      await ruleManagement.loadRules();
    } catch (error) {
      logger.error('Error toggling priority rule:', error);
    }
  };

  return (
    <RuleEditor<PriorityRuleView, PriorityRuleFormData>
      {...ruleManagement}
      title="Priority Rules"
      description="Decide which messages are critical, high, medium, or low"
      dialogTitle="Priority Rule"
      emptyMessage="No priority rules configured. Every message will be treated as medium priority until one exists."
      placeholder={
        unavailable ? (
          <Alert variant="info">
            <AlertTitle>Not available on this backend version</AlertTitle>
            <AlertDescription>
              Priority rules need a newer backend than the one this workspace is running. This
              screen will start working once the backend is updated — nothing else is required.
            </AlertDescription>
          </Alert>
        ) : undefined
      }
      renderBanners={() => (
        <div className="p-4 rounded-lg border bg-blue-500/10 border-blue-500/20">
          <p className="text-sm text-blue-600 dark:text-blue-400">
            <strong>Written as sentences, not keywords:</strong> a message is matched against the
            example text by meaning, so write a few sentences that read like the real messages
            belonging in this tier. A pipe-separated keyword list matches poorly here. Priority
            also drives SLA timers, so moving a tier changes response deadlines.
          </p>
        </div>
      )}
      renderPattern={(pattern) => (pattern.length > 120 ? `${pattern.slice(0, 120)}…` : pattern)}
      prefixColumns={[
        {
          header: 'Priority',
          render: (rule) => (
            <Badge variant={PRIORITY_VARIANT[rule.priority]} className="capitalize">
              {rule.priority}
            </Badge>
          ),
        },
      ]}
      renderMobileExtra={(rule) => (
        <Badge variant={PRIORITY_VARIANT[rule.priority]} className="capitalize">
          {rule.priority}
        </Badge>
      )}
      renderFormFields={(formData, setFormData) => (
        <>
          <ReactSelect
            label="Priority"
            value={formData.priority}
            onChange={(value) => setFormData({ ...formData, priority: value as PriorityLevel })}
            options={PRIORITY_OPTIONS}
          />
          <Input
            label="Name"
            value={formData.name}
            onChange={(event) => setFormData({ ...formData, name: event.target.value })}
            placeholder="e.g., priority_critical"
          />
          <div>
            <Label htmlFor="priority-description">Description</Label>
            <Textarea
              id="priority-description"
              value={formData.description}
              onChange={(event) => setFormData({ ...formData, description: event.target.value })}
              placeholder="What belongs in this tier"
              rows={2}
            />
          </div>
          <div>
            <Label htmlFor="priority-example">
              Example text (this is what messages are compared against)
            </Label>
            <Textarea
              id="priority-example"
              value={formData.exampleText}
              onChange={(event) => setFormData({ ...formData, exampleText: event.target.value })}
              placeholder="Several sentences that read like real messages in this tier — not a keyword list"
              rows={6}
              maxLength={4000}
            />
          </div>
          <Toggle
            checked={formData.active}
            onChange={(next) => setFormData({ ...formData, active: next })}
            label="Active"
          />
        </>
      )}
      isSaveDisabled={(formData) =>
        !formData.name || !formData.description || !formData.exampleText
      }
      onToggleActive={toggleActive}
    />
  );
};

/** Extracted so the component body stays readable; behaviour is the standard rule CRUD. */
const useRuleManagementForPriority = (setUnavailable: (next: boolean) => void) =>
  useRuleManagement<PriorityRuleView, PriorityRuleFormData>({
    fetchRules: async () => {
      try {
        const rules = await priorityRuleService.list();
        setUnavailable(false);
        return rules.map(toView);
      } catch (error) {
        // A backend without the endpoint is an expected state, not a failure: this repo
        // deploys on push while the backend ships on a tag. Surface it as the placeholder
        // rather than an empty table that looks like "no rules configured".
        if (error instanceof PriorityRulesUnavailableError) {
          setUnavailable(true);
          return [];
        }
        throw error;
      }
    },
    createRule: async (data) => {
      const response = await priorityRuleService.create(data);
      if (!response.data) throw new Error('Create failed');
      return toView(response.data);
    },
    updateRule: async (id, data) => {
      const response = await priorityRuleService.update(id, data);
      if (!response.data) throw new Error('Update failed');
      return toView(response.data);
    },
    deleteRule: async (id) => {
      await priorityRuleService.delete(id);
    },
    getInitialFormData: () => ({
      priority: 'medium',
      name: '',
      description: '',
      exampleText: '',
      active: true,
    }),
    getFormDataFromRule: (rule) => ({
      priority: rule.priority,
      name: rule.name,
      description: rule.description,
      exampleText: rule.exampleText,
      active: rule.active,
    }),
  });
