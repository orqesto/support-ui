import { useState } from 'react';
import { Brain, Lock } from 'lucide-react';
import DepartmentBadge from '@/components/admin/DepartmentBadge';
import { RuleEditor } from '@/components/shared/RuleEditor';
import { Badge } from '@/components/ui/Badge';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { usePermissions } from '@/hooks/usePermissions';
import { useRuleManagement } from '@/hooks/useRuleManagement';
import { settingsService, type SpamRule } from '@/services/settings.service';
import { logger } from '@/lib/logger';
import { prettifyRulePattern } from '@/lib/prettifyRulePattern';

type SpamRuleFormData = {
  name: string;
  description: string;
  pattern: string;
  exampleText: string;
  category: string;
  severity: number;
  active: boolean;
};

type RuleFilter = 'all' | 'manual' | 'feedback';

export const SpamRulesSettings = () => {
  const { isAdmin } = usePermissions();
  const [ruleFilter, setRuleFilter] = useState<RuleFilter>('all');

  const ruleManagement = useRuleManagement<SpamRule, SpamRuleFormData>({
    fetchRules: settingsService.getSpamRules,
    createRule: settingsService.createSpamRule,
    updateRule: settingsService.updateSpamRule,
    deleteRule: settingsService.deleteSpamRule,
    getInitialFormData: () => ({
      name: '',
      description: '',
      pattern: '',
      exampleText: '',
      category: 'content',
      severity: 10,
      active: true,
    }),
    getFormDataFromRule: (rule) => ({
      name: rule.name,
      description: rule.description,
      pattern: rule.pattern ?? '',
      exampleText: rule.exampleText ?? '',
      category: rule.category,
      severity: rule.severity,
      active: rule.active,
    }),
  });

  const toggleActive = async (rule: SpamRule) => {
    try {
      await settingsService.updateSpamRule(rule.id, {
        name: rule.name,
        description: rule.description,
        pattern: rule.pattern ?? undefined,
        exampleText: rule.exampleText ?? undefined,
        category: rule.category,
        severity: rule.severity,
        active: !rule.active,
      });
      await ruleManagement.loadRules();
    } catch (error) {
      logger.error('Error toggling rule:', error);
    }
  };

  const { rules } = ruleManagement;
  const feedbackCount = rules.filter((rule) => rule.name.startsWith('feedback_')).length;
  const filteredRules = rules.filter((rule) => {
    if (ruleFilter === 'feedback') return rule.name.startsWith('feedback_');
    if (ruleFilter === 'manual') return !rule.name.startsWith('feedback_');
    return true;
  });

  return (
    <RuleEditor<SpamRule, SpamRuleFormData>
      {...ruleManagement}
      rules={filteredRules}
      renderPattern={prettifyRulePattern}
      title="Spam Detection Rules"
      description="Configure rules and red flags for spam detection"
      dialogTitle="Spam Rule"
      renderBanners={() => (
        <>
          <div className="p-4 rounded-lg border bg-red-500/10 border-red-500/20">
            <p className="text-sm text-red-600 dark:text-red-400">
              <strong>🔒 System Protected Rules:</strong> Security rules cannot be modified or
              deleted. These protect against AI prompt injection and other security threats.
            </p>
          </div>
          <div className="p-4 space-y-1 rounded-lg border bg-amber-500/10 border-amber-500/20">
            <p className="text-sm text-amber-600 dark:text-amber-400">
              <strong>Severity:</strong> 1–49 = Flag for review · 50–99 = Mark as spam ·{' '}
              <strong className="text-red-600 dark:text-red-400">
                100 = Auto-reject (not saved to DB)
              </strong>
            </p>
          </div>
        </>
      )}
      renderFilters={() => (
        <div className="flex gap-1 p-1 rounded-lg bg-muted w-fit">
          {(['all', 'manual', 'feedback'] as RuleFilter[]).map((filter) => {
            const label =
              filter === 'all'
                ? `All (${rules.length})`
                : filter === 'manual'
                  ? `Manual (${rules.length - feedbackCount})`
                  : `Auto-learned (${feedbackCount})`;
            return (
              <button
                key={filter}
                onClick={() => setRuleFilter(filter)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors font-medium ${ruleFilter === filter ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {filter === 'feedback' && <Brain className="inline w-3 h-3 mr-1 opacity-70" />}
                {label}
              </button>
            );
          })}
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
          render: (rule) => (
            <div className="flex flex-col gap-1 items-center">
              <Badge>{rule.severity}</Badge>
              {rule.severity >= 100 && (
                <Badge variant="danger" className="text-xs">
                  Auto-Reject
                </Badge>
              )}
            </div>
          ),
        },
      ]}
      renderNameMeta={(rule) => {
        const isProtected = rule.category === 'security';
        const isFeedback = rule.name.startsWith('feedback_');
        return (
          <>
            <DepartmentBadge departmentId={rule.departmentId} size="sm" nullVariant="baseline" />
            {isProtected && (
              <Lock
                className="w-3 h-3 text-red-600 dark:text-red-400"
                aria-label="System-protected security rule"
              />
            )}
            {isFeedback && (
              <Badge variant="secondary" className="text-xs gap-0.5">
                <Brain className="w-2.5 h-2.5" />
                Auto-learned
              </Badge>
            )}
          </>
        );
      }}
      renderMobileExtra={(rule) => (
        <>
          <Badge>{rule.severity}</Badge>
          {rule.severity >= 100 && (
            <Badge variant="danger" className="text-xs">
              Auto-Reject
            </Badge>
          )}
        </>
      )}
      renderFormFields={(formData, setFormData) => (
        <>
          <div>
            <label className="block mb-1 text-sm font-medium">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(event) => setFormData({ ...formData, name: event.target.value })}
              className="px-3 py-2 w-full rounded-md border bg-background"
              placeholder="e.g., phishing_indicators"
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
            <label className="block mb-1 text-sm font-medium">Pattern (regex or keywords)</label>
            <input
              type="text"
              value={formData.pattern}
              onChange={(event) => setFormData({ ...formData, pattern: event.target.value })}
              className="px-3 py-2 w-full font-mono text-sm rounded-md border bg-background"
              placeholder="verify your account|confirm identity|suspended"
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
              placeholder="Sample spam text the rule should match (multilingual; falls back to pattern when empty)"
              rows={3}
              maxLength={5000}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <ReactSelect
              label="Category"
              value={formData.category}
              onChange={(value) => setFormData({ ...formData, category: value })}
              options={[
                { value: 'sender', label: 'Sender' },
                { value: 'subject', label: 'Subject' },
                { value: 'content', label: 'Content' },
              ]}
            />
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium">Severity</label>
                <span className="text-sm font-medium text-primary">
                  {formData.severity}
                  {formData.severity >= 100 && ' 🚫 Auto-Reject'}
                  {formData.severity >= 50 && formData.severity < 100 && ' ⚠️ Mark as Spam'}
                  {formData.severity < 50 && ' ℹ️ Flag for Review'}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={formData.severity}
                onChange={(event) =>
                  setFormData({ ...formData, severity: parseInt(event.target.value) })
                }
                className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-muted accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0 (Low)</span>
                <span>50 (Spam)</span>
                <span>100 (Reject)</span>
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
      isToggleDisabled={(rule) => rule.category === 'security' && !isAdmin}
      toggleTitle={(rule) =>
        rule.category === 'security' && !isAdmin
          ? 'Security rules can only be disabled by a global admin'
          : undefined
      }
      isEditDisabled={(rule) =>
        (rule.category === 'security' && !isAdmin) || rule.name.startsWith('feedback_')
      }
      editTitle={(rule) =>
        rule.category === 'security' && !isAdmin
          ? 'Security rules can only be edited by a global admin'
          : rule.name.startsWith('feedback_')
            ? 'Auto-learned rules cannot be edited'
            : undefined
      }
      isDeleteDisabled={(rule) => rule.category === 'security' && !isAdmin}
      deleteTitle={(rule) =>
        rule.category === 'security' && !isAdmin
          ? 'Security rules can only be deleted by a global admin'
          : undefined
      }
    />
  );
};
