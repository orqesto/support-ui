import { BookOpen } from 'lucide-react';
import { RuleEditor } from '@/components/shared/RuleEditor';
import { prettifyRulePattern } from '@/lib/prettifyRulePattern';
import { Badge } from '@/components/ui/Badge';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { useRuleManagement } from '@/hooks/useRuleManagement';
import { settingsService, type KnowledgeDetectionRule } from '@/services/settings.service';

const CATEGORIES = [
  { value: 'pricing', label: 'Pricing', description: 'Costs, fees, payment terms' },
  { value: 'policy', label: 'Policy', description: 'Business policies, terms' },
  { value: 'process', label: 'Process', description: 'Workflows, procedures' },
  { value: 'technical', label: 'Technical', description: 'Specs, requirements' },
  { value: 'delivery', label: 'Delivery', description: 'Timelines, schedules' },
  { value: 'features', label: 'Features', description: 'Product capabilities' },
  { value: 'compliance', label: 'Compliance', description: 'Regulations, security' },
];

type KbDetectionFormData = {
  name: string;
  description: string;
  category: string;
  pattern: string;
  exampleText: string;
  confidence: number;
  active: boolean;
};

const initialFormData = (): KbDetectionFormData => ({
  name: '',
  description: '',
  category: 'pricing',
  pattern: '',
  exampleText: '',
  confidence: 30,
  active: true,
});

export const KnowledgeDetectionRulesSettings = () => {
  const ruleManagement = useRuleManagement<KnowledgeDetectionRule, KbDetectionFormData>({
    fetchRules: settingsService.getKnowledgeDetectionRules,
    createRule: settingsService.createKnowledgeDetectionRule,
    updateRule: settingsService.updateKnowledgeDetectionRule,
    deleteRule: settingsService.deleteKnowledgeDetectionRule,
    getInitialFormData: initialFormData,
    getFormDataFromRule: (rule) => ({
      name: rule.name,
      description: rule.description,
      category: rule.category,
      pattern: rule.pattern ?? '',
      exampleText: rule.exampleText,
      confidence: rule.confidence,
      active: rule.active,
    }),
  });

  const toggleActive = async (rule: KnowledgeDetectionRule) => {
    await settingsService.updateKnowledgeDetectionRule(rule.id, { active: !rule.active });
    await ruleManagement.loadRules();
  };

  // Category stats — counts per category for active rules. Rendered as a banner
  // above the table so it lives inside the shared RuleEditor's standard layout.
  const categoryStats = CATEGORIES.map((cat) => ({
    ...cat,
    count: ruleManagement.rules.filter(
      (rule) => rule.category === cat.value && rule.active
    ).length,
  }));

  return (
    <RuleEditor<KnowledgeDetectionRule, KbDetectionFormData>
      {...ruleManagement}
      renderPattern={prettifyRulePattern}
      title="Knowledge Detection Rules"
      description="Configure semantic rules to detect valuable knowledge during KB ingestion (pricing, policies, specs, etc.)"
      dialogTitle="Knowledge Detection Rule"
      emptyMessage="No KB detection rules configured. Add your first rule to get started."
      renderBanners={() => (
        <>
          <div className="flex gap-2 items-center text-sm text-muted-foreground">
            <BookOpen className="w-4 h-4" />
            Knowledge detection runs during KB ingestion to identify standalone valuable content.
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
            {categoryStats.map((cat) => (
              <div
                key={cat.value}
                className="p-3 rounded-lg border bg-card"
                title={cat.description}
              >
                <div className="text-xs font-medium text-muted-foreground">{cat.label}</div>
                <div className="mt-1 text-2xl font-bold">{cat.count}</div>
              </div>
            ))}
          </div>
        </>
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
              placeholder="e.g., pricing_information"
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
          <div className="grid grid-cols-2 gap-4">
            <ReactSelect
              label="Category"
              value={formData.category}
              onChange={(value) => setFormData({ ...formData, category: value })}
              options={CATEGORIES.map((cat) => ({
                value: cat.value,
                label: `${cat.label} - ${cat.description}`,
              }))}
            />
            <div>
              <label className="block mb-1 text-sm font-medium">Confidence (0-100)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={formData.confidence}
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    confidence: parseInt(event.target.value) || 0,
                  })
                }
                className="px-3 py-2 w-full rounded-md border bg-background"
              />
            </div>
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium">Example Text (Required)</label>
            <textarea
              value={formData.exampleText}
              onChange={(event) => setFormData({ ...formData, exampleText: event.target.value })}
              className="px-3 py-2 w-full rounded-md border bg-background"
              placeholder="Provide an example of text this rule should detect (used for semantic matching)…"
              rows={4}
              maxLength={5000}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              This text is used to generate an embedding for semantic similarity matching.
            </p>
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium">Pattern (Optional)</label>
            <input
              type="text"
              value={formData.pattern}
              onChange={(event) => setFormData({ ...formData, pattern: event.target.value })}
              className="px-3 py-2 w-full font-mono text-sm rounded-md border bg-background"
              placeholder="Optional regex pattern or keywords"
            />
          </div>
          <div className="flex gap-2 items-center">
            <input
              type="checkbox"
              id="kb-active"
              checked={formData.active}
              onChange={(event) => setFormData({ ...formData, active: event.target.checked })}
              className="rounded"
            />
            <label htmlFor="kb-active" className="text-sm">
              Active
            </label>
          </div>
        </>
      )}
      isSaveDisabled={(formData) =>
        !formData.name.trim() ||
        !formData.description.trim() ||
        !formData.category ||
        !formData.exampleText.trim() ||
        formData.confidence < 0 ||
        formData.confidence > 100
      }
      onToggleActive={toggleActive}
    />
  );
};
