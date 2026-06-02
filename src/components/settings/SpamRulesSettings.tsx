import { useState } from 'react';
import { Plus, Edit2, Trash2, Save, X, Eye, EyeOff, Brain } from 'lucide-react';
import DepartmentBadge from '@/components/admin/DepartmentBadge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { useRuleManagement } from '@/hooks/useRuleManagement';
import { settingsService, type SpamRule } from '@/services/settings.service';
import { logger } from '@/lib/logger';

type SpamRuleFormData = {
  name: string;
  description: string;
  pattern: string;
  category: string;
  severity: number;
  active: boolean;
};

type RuleFilter = 'all' | 'manual' | 'feedback';

export const SpamRulesSettings = () => {
  const [ruleFilter, setRuleFilter] = useState<RuleFilter>('all');
  const {
    loading,
    rules,
    editingRule,
    isCreating,
    deleteDialogOpen,
    ruleToDelete,
    formData,
    setFormData,
    handleEdit,
    handleCreate,
    handleCancel,
    handleSave,
    handleDeleteClick,
    handleDeleteConfirm,
    handleDeleteCancel,
    loadRules,
  } = useRuleManagement<SpamRule, SpamRuleFormData>({
    fetchRules: settingsService.getSpamRules,
    createRule: settingsService.createSpamRule,
    updateRule: settingsService.updateSpamRule,
    deleteRule: settingsService.deleteSpamRule,
    getInitialFormData: () => ({
      name: '',
      description: '',
      pattern: '',
      category: 'content',
      severity: 10,
      active: true,
    }),
    getFormDataFromRule: (rule) => ({
      name: rule.name,
      description: rule.description,
      pattern: rule.pattern ?? '',
      category: rule.category,
      severity: rule.severity,
      active: rule.active,
    }),
  });

  const toggleActive = async (id: number) => {
    const rule = rules.find((ruleItem) => ruleItem.id === id);
    if (!rule) return;
    try {
      await settingsService.updateSpamRule(id, {
        name: rule.name,
        description: rule.description,
        pattern: rule.pattern ?? undefined,
        category: rule.category,
        severity: rule.severity,
        active: !rule.active,
      });
      await loadRules();
    } catch (error) {
      logger.error('Error toggling rule:', error);
    }
  };

  const feedbackCount = rules.filter((rule) => rule.name.startsWith('feedback_')).length;
  const filteredRules = rules.filter((rule) => {
    if (ruleFilter === 'feedback') return rule.name.startsWith('feedback_');
    if (ruleFilter === 'manual') return !rule.name.startsWith('feedback_');
    return true;
  });

  const getSeverityVariant = (severity: number): 'danger' | 'warning' | 'default' | 'secondary' => {
    if (severity >= 50) return 'danger';
    if (severity >= 25) return 'warning';
    return 'default';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-start">
        <div>
          <h3 className="text-lg font-semibold">Spam Detection Rules</h3>
          <p className="text-sm text-muted-foreground">
            Configure rules and red flags for spam detection
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 w-4 h-4" />
          Add Rule
        </Button>
      </div>

      {/* Security Notice */}
      <div className="p-4 rounded-lg border bg-red-500/10 border-red-500/20">
        <p className="text-sm text-red-600 dark:text-red-400">
          <strong>🔒 System Protected Rules:</strong> Security rules cannot be modified or deleted.
          These protect against AI prompt injection and other security threats.
        </p>
      </div>

      {/* Info Banner */}
      <div className="p-4 space-y-1 rounded-lg border bg-amber-500/10 border-amber-500/20">
        <p className="text-sm text-amber-600 dark:text-amber-400">
          <strong>Severity:</strong> 1–49 = Flag for review · 50–99 = Mark as spam ·{' '}
          <strong className="text-red-600 dark:text-red-400">
            100 = Auto-reject (not saved to DB)
          </strong>
        </p>
      </div>

      {/* Filter tabs */}
      {!loading && rules.length > 0 && (
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

      {/* Rules Table */}
      {loading ? (
        <div className="py-12 text-center text-muted-foreground">Loading rules...</div>
      ) : filteredRules.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          {rules.length === 0
            ? 'No spam rules configured. Add your first rule to get started.'
            : 'No rules match the selected filter.'}
        </div>
      ) : (
        <>
          <div className="hidden lg:block overflow-x-auto rounded-lg border">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-xs font-medium tracking-wider text-left uppercase text-muted-foreground">
                    Name
                  </th>
                  <th className="px-4 py-3 text-xs font-medium tracking-wider text-left uppercase text-muted-foreground">
                    Category
                  </th>
                  <th className="px-4 py-3 text-xs font-medium tracking-wider text-left uppercase text-muted-foreground">
                    Description
                  </th>
                  <th className="px-4 py-3 text-xs font-medium tracking-wider text-left uppercase text-muted-foreground">
                    Pattern
                  </th>
                  <th className="px-4 py-3 text-xs font-medium tracking-wider text-center uppercase text-muted-foreground">
                    Severity
                  </th>
                  <th className="px-4 py-3 text-xs font-medium tracking-wider text-center uppercase text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3 text-xs font-medium tracking-wider text-right uppercase text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y bg-background divide-border">
                {filteredRules.map((rule) => {
                  const isProtected = rule.category === 'security';
                  const isFeedback = rule.name.startsWith('feedback_');
                  return (
                    <tr key={rule.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-sm font-medium">{rule.name}</p>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          <DepartmentBadge departmentId={rule.departmentId} size="sm" />
                          {isProtected && (
                            <Badge variant="danger" className="text-xs">
                              🔒 Protected
                            </Badge>
                          )}
                          {isFeedback && (
                            <Badge variant="secondary" className="text-xs gap-0.5">
                              <Brain className="w-2.5 h-2.5" />
                              Auto-learned
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        <Badge variant="secondary" className="capitalize">
                          {rule.category}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 max-w-xs text-sm truncate text-muted-foreground">
                        {rule.description}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {rule.pattern ? (
                          <code className="block max-w-[180px] truncate px-2 py-0.5 font-mono text-xs rounded bg-muted">
                            {rule.pattern}
                          </code>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        <div className="flex flex-col gap-1 items-center">
                          <Badge variant={getSeverityVariant(rule.severity)}>{rule.severity}</Badge>
                          {rule.severity >= 100 && (
                            <Badge variant="danger" className="text-xs">
                              🚫 Auto-Reject
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        <button
                          onClick={() => !isProtected && toggleActive(rule.id)}
                          disabled={isProtected}
                          className="inline-flex gap-1 items-center transition-colors hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                          title={
                            isProtected
                              ? 'Security rules cannot be disabled'
                              : rule.active
                                ? 'Deactivate'
                                : 'Activate'
                          }
                        >
                          {rule.active ? (
                            <>
                              <Eye className="w-4 h-4 text-green-600" />
                              <span className="text-xs text-green-600">Active</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-4 h-4 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">Inactive</span>
                            </>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-right whitespace-nowrap">
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(rule)}
                            disabled={isProtected || isFeedback}
                            title={
                              isProtected
                                ? 'Security rules cannot be edited'
                                : isFeedback
                                  ? 'Auto-learned rules cannot be edited'
                                  : 'Edit'
                            }
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteClick(rule)}
                            disabled={isProtected}
                            title={isProtected ? 'Security rules cannot be deleted' : 'Delete'}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950 disabled:text-muted-foreground"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden space-y-3">
            {filteredRules.map((rule) => {
              const isProtected = rule.category === 'security';
              const isFeedback = rule.name.startsWith('feedback_');
              return (
                <div key={rule.id} className="p-4 rounded-lg border bg-card space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{rule.name}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <Badge variant="secondary" className="capitalize">
                          {rule.category}
                        </Badge>
                        <DepartmentBadge departmentId={rule.departmentId} size="sm" />
                        {isProtected && (
                          <Badge variant="danger" className="text-xs">
                            🔒 Protected
                          </Badge>
                        )}
                        {isFeedback && (
                          <Badge variant="secondary" className="text-xs gap-0.5">
                            <Brain className="w-2.5 h-2.5" />
                            Auto-learned
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(rule)}
                        disabled={isProtected || isFeedback}
                        title={
                          isProtected
                            ? 'Security rules cannot be edited'
                            : isFeedback
                              ? 'Auto-learned rules cannot be edited'
                              : 'Edit'
                        }
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(rule)}
                        disabled={isProtected}
                        title={isProtected ? 'Security rules cannot be deleted' : 'Delete'}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950 disabled:text-muted-foreground"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{rule.description}</p>
                  {rule.pattern && (
                    <code className="block px-2 py-1 font-mono text-xs rounded bg-muted break-all">
                      {rule.pattern}
                    </code>
                  )}
                  <div className="flex flex-wrap gap-2 items-center justify-between">
                    <div className="flex flex-wrap gap-1 items-center">
                      <Badge variant={getSeverityVariant(rule.severity)}>{rule.severity}</Badge>
                      {rule.severity >= 100 && (
                        <Badge variant="danger" className="text-xs">
                          🚫 Auto-Reject
                        </Badge>
                      )}
                    </div>
                    <button
                      onClick={() => !isProtected && toggleActive(rule.id)}
                      disabled={isProtected}
                      className="inline-flex gap-1 items-center transition-colors hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {rule.active ? (
                        <>
                          <Eye className="w-4 h-4 text-green-600" />
                          <span className="text-xs text-green-600">Active</span>
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-4 h-4 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Inactive</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Edit / Create Dialog */}
      <Dialog open={isCreating || editingRule !== null} onOpenChange={handleCancel}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isCreating ? 'Create' : 'Edit'} Spam Rule</DialogTitle>
            <DialogClose onClose={handleCancel} />
          </DialogHeader>
          <div className="space-y-4">
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              <X className="mr-1 w-4 h-4" />
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!formData.name || !formData.description}
              className="gap-1"
            >
              <Save className="w-4 h-4" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={handleDeleteCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Spam Rule</DialogTitle>
            <DialogClose onClose={handleDeleteCancel} />
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete &quot;{ruleToDelete?.name}&quot;? This action cannot be
            undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={handleDeleteCancel}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              <Trash2 className="mr-1 w-4 h-4" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
