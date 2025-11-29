import { Plus, Edit2, Trash2, Save, X, Eye, EyeOff } from 'lucide-react';
import DepartmentBadge from '@/components/admin/DepartmentBadge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { useRuleManagement } from '@/hooks/useRuleManagement';
import { settingsService, type SpamRule } from '@/services/settings.service';

type SpamRuleFormData = {
  name: string;
  description: string;
  pattern: string;
  category: string;
  severity: number;
  active: boolean;
};

export const SpamRulesSettings = () => {
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
    const rule = rules.find((r) => r.id === id);
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
      // Reload rules to show updated state
      await loadRules();
    } catch (error) {
      console.error('Error toggling rule:', error);
    }
  };

  const getSeverityColor = (severity: number) => {
    if (severity >= 100) {
      return 'danger'; // Critical spam - auto-reject
    }
    if (severity >= 50) {
      return 'danger'; // Mark as spam
    }
    if (severity >= 25) {
      return 'warning'; // Flag for review
    }
    return 'default';
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-star">
        <div>
          <h3 className="text-lg font-semibold sm:">Spam Detection Rules</h3>
          <p className="text-sm text-muted-foreground">
            Configure rules and red flags for spam detection
          </p>
        </div>
        <Button className="h-12 sm:" onClick={handleCreate} disabled={isCreating}>
          <Plus className="mr-2 w-4 h-4" />
          Add Rule
        </Button>
      </div>

      {/* Security Notice */}
      <div className="p-4 rounded-lg border bg-red-500/10 dark:bg-red-500/10 border-red-500/20">
        <p className="text-sm text-red-600 dark:text-red-400">
          <strong>🔒 System Protected Rules:</strong> Security rules (marked with 🔒 SYSTEM
          PROTECTED) cannot be modified or deleted. These protect against AI prompt injection and
          other security threats.
        </p>
      </div>

      {/* Info Banner */}
      <div className="p-4 space-y-2 rounded-lg border bg-yellow-500/10 dark:bg-yellow-500/10 border-yellow-500/20">
        <p className="text-sm text-yellow-600 dark:text-yellow-400">
          <strong>Pattern Matching:</strong> Use regex or keywords separated by{' '}
          <code className="px-1 rounded bg-yellow-500/20">|</code> (pipe).
        </p>
        <p className="text-sm text-yellow-600 dark:text-yellow-400">
          <strong>Severity Levels:</strong>
        </p>
        <ul className="ml-4 space-y-1 text-sm list-disc text-yellow-600 dark:text-yellow-400">
          <li>
            <strong>1-49:</strong> Flag for review (save to database, mark as suspicious)
          </li>
          <li>
            <strong>50-99:</strong> Mark as spam (save to database but don&apos;t process)
          </li>
          <li>
            <strong>100:</strong>{' '}
            <span className="font-bold text-red-600 dark:text-red-400">
              Critical spam - Auto-reject immediately (don&apos;t save to database)
            </span>
          </li>
        </ul>
      </div>

      {/* New Rule Form */}
      {isCreating && (
        <div className="p-4 space-y-4 rounded-lg border bg-card border-border">
          <h4 className="font-semibold">New Spam Rule</h4>
          <div className="grid gap-4">
            <div>
              <label htmlFor="name" className="text-sm font-medium">
                Rule Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                placeholder="e.g., phishing_indicators"
              />
            </div>
            <div>
              <label htmlFor="description" className="text-sm font-medium">
                Description
              </label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                placeholder="What this rule detects"
              />
            </div>
            <div>
              <label htmlFor="pattern" className="text-sm font-medium">
                Pattern (regex or keywords)
              </label>
              <input
                type="text"
                value={formData.pattern}
                onChange={(e) => setFormData({ ...formData, pattern: e.target.value })}
                className="px-3 py-2 w-full font-mono text-sm rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
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
                  <label htmlFor="severity" className="text-sm font-medium">
                    Severity
                  </label>
                  <span className="text-sm font-medium text-primary">
                    {formData.severity}
                    {formData.severity >= 100 && ' 🚫 Auto-Reject'}
                    {formData.severity >= 50 && formData.severity < 100 && ' ⚠️ Mark as Spam'}
                    {formData.severity < 50 && ' ℹ️ Flag for Review'}
                  </span>
                </div>
                <input
                  type="range"
                  id="severity"
                  min="0"
                  max="100"
                  step="5"
                  value={formData.severity}
                  onChange={(e) => setFormData({ ...formData, severity: parseInt(e.target.value) })}
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
                id="active-new"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="active-new" className="text-sm font-medium">
                Active (enable this rule)
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={!formData.name || !formData.description}>
              <Save className="mr-2 w-4 h-4" />
              Save
            </Button>
            <Button variant="outline" onClick={handleCancel}>
              <X className="mr-2 w-4 h-4" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Rules List */}
      <div className="space-y-3">
        {rules.map((rule) => (
          <div key={rule.id} className="p-4 rounded-lg border border-border bg-card">
            {editingRule?.id === rule.id ? (
              <div className="space-y-4">
                <h4 className="font-semibold">Edit Spam Rule</h4>
                <div className="grid gap-4">
                  <div>
                    <label htmlFor="name" className="text-sm font-medium">
                      Rule Name
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label htmlFor="description" className="text-sm font-medium">
                      Description
                    </label>
                    <input
                      type="text"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label htmlFor="pattern" className="text-sm font-medium">
                      Pattern
                    </label>
                    <input
                      type="text"
                      value={formData.pattern}
                      onChange={(e) => setFormData({ ...formData, pattern: e.target.value })}
                      className="px-3 py-2 w-full font-mono text-sm rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary"
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
                        <label htmlFor="severity-edit" className="text-sm font-medium">
                          Severity
                        </label>
                        <span className="text-sm font-medium text-primary">
                          {formData.severity}
                          {formData.severity >= 100 && ' 🚫 Auto-Reject'}
                          {formData.severity >= 50 && formData.severity < 100 && ' ⚠️ Mark as Spam'}
                          {formData.severity < 50 && ' ℹ️ Flag for Review'}
                        </span>
                      </div>
                      <input
                        type="range"
                        id="severity-edit"
                        min="0"
                        max="100"
                        step="5"
                        value={formData.severity}
                        onChange={(e) =>
                          setFormData({ ...formData, severity: parseInt(e.target.value) })
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
                      id={`active-${rule.id}`}
                      checked={formData.active}
                      onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                      className="rounded"
                    />
                    <label htmlFor={`active-${rule.id}`} className="text-sm font-medium">
                      Active
                    </label>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSave}>
                    <Save className="mr-2 w-4 h-4" />
                    Save
                  </Button>
                  <Button variant="outline" onClick={handleCancel}>
                    <X className="mr-2 w-4 h-4" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
                  <div className="flex-1">
                    <div className="flex flex-wrap gap-2 items-center">
                      <h4 className="text-lg font-semibold">{rule.name}</h4>
                      <DepartmentBadge department={rule.departmentRole} size="sm" />
                      <Badge variant={rule.active ? 'success' : 'default'}>
                        {rule.active ? 'Active' : 'Inactive'}
                      </Badge>
                      <Badge variant={getSeverityColor(rule.severity)}>
                        Severity: {rule.severity}
                      </Badge>
                      {rule.severity >= 100 && (
                        <Badge variant="danger" className="font-bold">
                          🚫 AUTO-REJECT
                        </Badge>
                      )}
                      {rule.category === 'security' && (
                        <Badge variant="danger" className="font-bold">
                          🔒 SYSTEM PROTECTED
                        </Badge>
                      )}
                      <Badge variant="secondary" className="capitalize">
                        {rule.category}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{rule.description}</p>
                    {rule.pattern && (
                      <div className="mt-2">
                        <p className="mb-1 text-xs font-medium text-muted-foreground">Pattern:</p>
                        <code className="px-2 py-1 font-mono text-xs break-words rounded bg-muted">
                          {rule.pattern}
                        </code>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleActive(rule.id)}
                      title={
                        rule.category === 'security'
                          ? 'Security rules cannot be disabled'
                          : rule.active
                            ? 'Deactivate'
                            : 'Activate'
                      }
                      disabled={rule.category === 'security'}
                    >
                      {rule.active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(rule)}
                      disabled={rule.category === 'security'}
                      title={
                        rule.category === 'security' ? 'Security rules cannot be edited' : 'Edit'
                      }
                    >
                      <Edit2 className="mr-2 w-4 h-4" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDeleteClick(rule)}
                      aria-label="Delete spam rule"
                      disabled={rule.category === 'security'}
                      title={
                        rule.category === 'security' ? 'Security rules cannot be deleted' : 'Delete'
                      }
                    >
                      <Trash2 className="mr-2 w-4 h-4" />
                      Delete
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={handleDeleteCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Spam Rule</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to delete this spam detection rule?</p>
          {ruleToDelete && (
            <div className="p-4 mt-4 rounded bg-muted">
              <p className="text-sm font-medium">{ruleToDelete.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{ruleToDelete.description}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={handleDeleteCancel}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
