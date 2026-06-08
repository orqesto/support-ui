import { logger } from '@/lib/logger';
import { prettifyRulePattern } from '@/lib/prettifyRulePattern';
import { RuleEditor } from '@/components/shared/RuleEditor';
import { Badge } from '@/components/ui/Badge';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { useRuleManagement } from '@/hooks/useRuleManagement';
import DepartmentBadge from '@/components/admin/DepartmentBadge';
import {
  detectionRuleService,
  type DetectionRule,
  type DetectionRuleCategory,
} from '@/services/detectionRule.service';

const CATEGORY_OPTIONS = [
  { value: 'issue', label: 'Issue' },
  { value: 'help', label: 'Help Request' },
  { value: 'question', label: 'Question' },
  { value: 'access', label: 'Access' },
  { value: 'account', label: 'Account' },
  { value: 'urgent', label: 'Urgent' },
];

type DetectionRuleFormData = {
  name: string;
  description: string;
  pattern: string;
  exampleText: string;
  category: DetectionRuleCategory;
  confidence: number;
  active: boolean;
};

export const DetectionRulesSettings = () => {
  const ruleManagement = useRuleManagement<DetectionRule, DetectionRuleFormData>({
    fetchRules: async () => {
      const response = await detectionRuleService.getAll();
      return response.data ?? [];
    },
    createRule: async (data) => {
      const response = await detectionRuleService.create(data);
      if (!response.data) throw new Error('Create failed');
      return response.data;
    },
    updateRule: async (id, data) => {
      const response = await detectionRuleService.update(id, data);
      if (!response.data) throw new Error('Update failed');
      return response.data;
    },
    deleteRule: async (id) => {
      await detectionRuleService.delete(id);
    },
    getInitialFormData: () => ({
      name: '',
      description: '',
      pattern: '',
      exampleText: '',
      category: 'issue',
      confidence: 20,
      active: true,
    }),
    getFormDataFromRule: (rule) => ({
      name: rule.name,
      description: rule.description,
      pattern: rule.pattern ?? '',
      exampleText: rule.exampleText ?? '',
      category: rule.category,
      confidence: rule.confidence,
      active: rule.active,
    }),
  });

  const toggleActive = async (rule: DetectionRule) => {
    try {
      await detectionRuleService.update(rule.id, { active: !rule.active });
      await ruleManagement.loadRules();
    } catch (error) {
      logger.error('Error toggling rule:', error);
    }
  };

  return (
    <RuleEditor<DetectionRule, DetectionRuleFormData>
      {...ruleManagement}
      renderPattern={prettifyRulePattern}
      title="Detection Rules"
      description="Configure patterns to identify legitimate support requests"
      dialogTitle="Detection Rule"
      renderBanners={() => (
        <div className="p-4 rounded-lg border bg-blue-500/10 border-blue-500/20">
          <p className="text-sm text-blue-600 dark:text-blue-400">
            <strong>Pattern Matching:</strong> Use regex or keywords separated by{' '}
            <code className="px-1 rounded bg-blue-500/20">|</code> (pipe). Higher confidence scores
            (0-100) indicate stronger support signals.
          </p>
        </div>
      )}
      prefixColumns={[
        {
          header: 'Category',
          render: (rule) => (
            <Badge variant="secondary" className="capitalize">
              {rule.category}
            </Badge>
          ),
        },
      ]}
      suffixColumns={[
        {
          header: 'Score',
          align: 'center',
          render: (rule) => <Badge>{rule.confidence}</Badge>,
        },
      ]}
      renderNameMeta={(rule) => (
        <DepartmentBadge departmentId={rule.departmentId} size="sm" nullVariant="baseline" />
      )}
      renderMobileExtra={(rule) => <Badge>{rule.confidence}</Badge>}
      renderFormFields={(formData, setFormData) => (
        <>
          <div>
            <label className="block mb-1 text-sm font-medium">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(event) => setFormData({ ...formData, name: event.target.value })}
              className="px-3 py-2 w-full rounded-md border bg-background"
              placeholder="e.g., urgent_customer_issue"
            />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium">Description</label>
            <textarea
              value={formData.description}
              onChange={(event) => setFormData({ ...formData, description: event.target.value })}
              className="px-3 py-2 w-full rounded-md border bg-background"
              placeholder="What this rule detects"
              rows={2}
            />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium">
              Pattern (regex or keywords)
            </label>
            <input
              type="text"
              value={formData.pattern}
              onChange={(event) => setFormData({ ...formData, pattern: event.target.value })}
              className="px-3 py-2 w-full font-mono text-sm rounded-md border bg-background"
              placeholder="problem|issue|error|need help"
            />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium">
              Example text (used for semantic embedding match)
            </label>
            <textarea
              value={formData.exampleText}
              onChange={(event) => setFormData({ ...formData, exampleText: event.target.value })}
              className="px-3 py-2 w-full rounded-md border bg-background"
              placeholder="Sample legitimate request the rule should match (multilingual; falls back to pattern when empty)"
              rows={3}
              maxLength={5000}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <ReactSelect
              label="Category"
              value={formData.category}
              onChange={(value) =>
                setFormData({ ...formData, category: value as DetectionRuleCategory })
              }
              options={CATEGORY_OPTIONS}
            />
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium">Confidence</label>
                <span className="text-sm font-medium text-primary">
                  {formData.confidence}
                  {formData.confidence >= 30 && ' ✅ Strong'}
                  {formData.confidence >= 20 && formData.confidence < 30 && ' ℹ️ Moderate'}
                  {formData.confidence < 20 && ' ⚡ Weak'}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={formData.confidence}
                onChange={(event) =>
                  setFormData({ ...formData, confidence: parseInt(event.target.value) })
                }
                className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-muted accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0 (Weak)</span>
                <span>20 (Moderate)</span>
                <span>30+ (Strong)</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <input
              type="checkbox"
              id="active"
              checked={formData.active}
              onChange={(event) => setFormData({ ...formData, active: event.target.checked })}
              className="rounded"
            />
            <label htmlFor="active" className="text-sm">
              Active
            </label>
          </div>
        </>
      )}
      isSaveDisabled={(formData) => !formData.name || !formData.description}
      onToggleActive={toggleActive}
    />
  );
};
