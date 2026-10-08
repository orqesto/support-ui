import { useState } from 'react';
import { Brain, Lock } from 'lucide-react';
import DepartmentBadge from '@/components/admin/DepartmentBadge';
import { RuleEditor } from '@/components/shared/RuleEditor';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { usePermissions } from '@/hooks/usePermissions';
import { useRuleManagement } from '@/hooks/useRuleManagement';
import { settingsService, type SpamRule } from '@/services/settings.service';
import { logger } from '@/lib/logger';
import { prettifyRulePattern } from '@/lib/prettifyRulePattern';
import {
  MATCH_FIELD_OPTIONS,
  categoryLabel,
  categoryOptionsFor,
  filesAsNotice,
  initialSpamRuleForm,
  matchFieldLabel,
  spamRuleFormFromRule,
  type SpamRuleFormData,
  type SpamRuleMatchField,
} from './spamRuleForm';

type RuleFilter = 'all' | 'manual' | 'feedback';

export const SpamRulesSettings = () => {
  const { isAdmin } = usePermissions();
  const [ruleFilter, setRuleFilter] = useState<RuleFilter>('all');

  const ruleManagement = useRuleManagement<SpamRule, SpamRuleFormData>({
    fetchRules: settingsService.getSpamRules,
    createRule: settingsService.createSpamRule,
    updateRule: settingsService.updateSpamRule,
    deleteRule: settingsService.deleteSpamRule,
    getInitialFormData: initialSpamRuleForm,
    getFormDataFromRule: spamRuleFormFromRule,
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
          <div className="p-4 rounded-lg border bg-destructive/10 border-destructive-line">
            <p className="text-sm text-destructive">
              <strong>🔒 System Protected Rules:</strong> Security rules cannot be modified or
              deleted. These protect against AI prompt injection and other security threats.
            </p>
          </div>
          <div className="p-4 space-y-1 rounded-lg border bg-warning/10 border-warning-line">
            <p className="text-sm text-warning">
              <strong>Severity:</strong> 1–49 = Flag for review · 50–99 = Mark as spam ·{' '}
              <strong className="text-destructive">100 = Auto-reject (not saved to DB)</strong>
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
              <Button
                key={filter}
                variant="ghost"
                size="sm"
                onClick={() => setRuleFilter(filter)}
                className={`px-3 py-1.5 h-auto text-sm rounded-md font-medium ${ruleFilter === filter ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {filter === 'feedback' && <Brain className="inline w-3 h-3 mr-1 opacity-70" />}
                {label}
              </Button>
            );
          })}
        </div>
      )}
      prefixColumns={[
        {
          header: 'Category',
          render: (rule) => (
            <div className="flex flex-col gap-1 items-start">
              <Badge variant="secondary">{categoryLabel(rule.category)}</Badge>
              <span className="text-xs text-muted-foreground" data-testid="spam-rule-match-on">
                on {matchFieldLabel(rule).toLowerCase()}
              </span>
            </div>
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
                className="w-3 h-3 text-destructive"
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
            <Textarea
              value={formData.description}
              onChange={(event) => setFormData({ ...formData, description: event.target.value })}
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
            <Textarea
              value={formData.exampleText}
              onChange={(event) => setFormData({ ...formData, exampleText: event.target.value })}
              placeholder="Sample spam text the rule should match (multilingual; falls back to pattern when empty)"
              rows={3}
              maxLength={5000}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Match on"
              value={formData.matchField}
              onChange={(value) =>
                setFormData({ ...formData, matchField: value as SpamRuleMatchField })
              }
              options={MATCH_FIELD_OPTIONS}
            />
            <Select
              label="Category"
              value={formData.category}
              onChange={(value) => setFormData({ ...formData, category: value })}
              options={categoryOptionsFor(formData.category)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Sender address is the customer&apos;s. When your own address (a web form, a shop)
            sends mail that names the customer, the customer&apos;s address is the one checked, not
            yours — match those on the subject.
          </p>
          {filesAsNotice(formData) && (
            <p className="text-xs text-muted-foreground" data-testid="spam-rule-notice-hint">
              This rule files matching mail as a system notice, without AI and outside the inbox.
              If the same mail looks like phishing or a security threat (a failed sender check, or a
              phishing or security rule), it is flagged as that instead. Severity is not used.
            </p>
          )}
          <div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium">Severity</label>
                <span className="text-sm font-medium text-foreground">
                  {formData.severity}
                  {filesAsNotice(formData) ? (
                    ' — not used for a notice rule'
                  ) : (
                    <>
                      {formData.severity >= 100 && ' 🚫 Auto-Reject'}
                      {formData.severity >= 50 && formData.severity < 100 && ' ⚠️ Mark as Spam'}
                      {formData.severity < 50 && ' ℹ️ Flag for Review'}
                    </>
                  )}
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
      isEditDisabled={(rule) => rule.category === 'security' && !isAdmin}
      editTitle={(rule) =>
        rule.category === 'security' && !isAdmin
          ? 'Security rules can only be edited by a global admin'
          : rule.name.startsWith('feedback_')
            ? 'Editing an auto-learned rule regenerates its match and resets its learned confidence'
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
