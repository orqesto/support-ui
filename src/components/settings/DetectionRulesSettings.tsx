import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Save, X, Eye, EyeOff } from 'lucide-react';
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
import {  detectionRuleService,
  type DetectionRule,
  type DetectionRuleCategory,
} from '@/services/detectionRule.service';
import { logger } from '@/lib/logger';

const CATEGORY_OPTIONS = [
  { value: 'issue', label: 'Issue' },
  { value: 'help', label: 'Help Request' },
  { value: 'question', label: 'Question' },
  { value: 'access', label: 'Access' },
  { value: 'account', label: 'Account' },
  { value: 'urgent', label: 'Urgent' },
];

export const DetectionRulesSettings = () => {
  const [rules, setRules] = useState<DetectionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<DetectionRule | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<DetectionRule | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    pattern: string;
    category: DetectionRuleCategory;
    confidence: number;
    active: boolean;
  }>({
    name: '',
    description: '',
    pattern: '',
    category: 'issue',
    confidence: 20,
    active: true,
  });

  const fetchRules = async () => {
    try {
      setLoading(true);
      const response = await detectionRuleService.getAll();
      if (response.success && response.data) {
        setRules(response.data);
      }
    } catch (error) {
      logger.error('Error fetching detection rules:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules().catch((error) => {
      logger.error('Failed to fetch rules:', error);
    });
  }, []);

  const handleEdit = (rule: DetectionRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      description: rule.description,
      pattern: rule.pattern ?? '',
      category: rule.category,
      confidence: rule.confidence,
      active: rule.active,
    });
  };

  const handleCreate = () => {
    setIsCreating(true);
    setFormData({ name: '', description: '', pattern: '', category: 'issue', confidence: 20, active: true });
  };

  const handleSave = async () => {
    try {
      if (editingRule) {
        await detectionRuleService.update(editingRule.id, formData);
      } else if (isCreating) {
        await detectionRuleService.create(formData);
      }
      await fetchRules();
      setEditingRule(null);
      setIsCreating(false);
    } catch (error) {
      logger.error('Error saving rule:', error);
    }
  };

  const handleCancel = () => {
    setEditingRule(null);
    setIsCreating(false);
  };

  const handleDeleteClick = (rule: DetectionRule) => {
    setRuleToDelete(rule);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!ruleToDelete) return;
    try {
      await detectionRuleService.delete(ruleToDelete.id);
      await fetchRules();
      setDeleteDialogOpen(false);
      setRuleToDelete(null);
    } catch (error) {
      logger.error('Error deleting rule:', error);
    }
  };

  const toggleActive = async (rule: DetectionRule) => {
    try {
      await detectionRuleService.update(rule.id, { active: !rule.active });
      await fetchRules();
    } catch (error) {
      logger.error('Error toggling rule:', error);
    }
  };

  const getConfidenceVariant = (confidence: number): 'success' | 'default' | 'secondary' => {
    if (confidence >= 30) return 'success';
    if (confidence >= 20) return 'default';
    return 'secondary';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-start">
        <div>
          <h3 className="text-lg font-semibold">Detection Rules</h3>
          <p className="text-sm text-muted-foreground">
            Configure patterns to identify legitimate support requests
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 w-4 h-4" />
          Add Rule
        </Button>
      </div>

      {/* Info Banner */}
      <div className="p-4 rounded-lg border bg-blue-500/10 border-blue-500/20">
        <p className="text-sm text-blue-600 dark:text-blue-400">
          <strong>Pattern Matching:</strong> Use regex or keywords separated by{' '}
          <code className="px-1 rounded bg-blue-500/20">|</code> (pipe). Higher confidence scores
          (0-100) indicate stronger support signals.
        </p>
      </div>

      {/* Rules Table */}
      {loading ? (
        <div className="py-12 text-center text-muted-foreground">Loading rules...</div>
      ) : rules.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          No detection rules configured. Add your first rule to get started.
        </div>
      ) : (
        <>
        <div className="hidden lg:block overflow-x-auto rounded-lg border">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-xs font-medium tracking-wider text-left uppercase text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-xs font-medium tracking-wider text-left uppercase text-muted-foreground">Category</th>
                <th className="px-4 py-3 text-xs font-medium tracking-wider text-left uppercase text-muted-foreground">Description</th>
                <th className="px-4 py-3 text-xs font-medium tracking-wider text-left uppercase text-muted-foreground">Pattern</th>
                <th className="px-4 py-3 text-xs font-medium tracking-wider text-center uppercase text-muted-foreground">Confidence</th>
                <th className="px-4 py-3 text-xs font-medium tracking-wider text-center uppercase text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-xs font-medium tracking-wider text-right uppercase text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y bg-background divide-border">
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="text-sm font-medium">{rule.name}</p>
                    <DepartmentBadge department={rule.departmentRole} size="sm" />
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">
                    <Badge variant="secondary" className="capitalize">{rule.category}</Badge>
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
                    <Badge variant={getConfidenceVariant(rule.confidence)}>{rule.confidence}</Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    <button
                      onClick={() => toggleActive(rule)}
                      className="inline-flex gap-1 items-center transition-colors hover:text-primary"
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
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(rule)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(rule)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="lg:hidden space-y-3">
          {rules.map((rule) => (
            <div key={rule.id} className="p-4 rounded-lg border bg-card space-y-3">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{rule.name}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <Badge variant="secondary" className="capitalize">{rule.category}</Badge>
                    <DepartmentBadge department={rule.departmentRole} size="sm" />
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(rule)}>
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteClick(rule)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{rule.description}</p>
              {rule.pattern && (
                <code className="block px-2 py-1 font-mono text-xs rounded bg-muted break-all">{rule.pattern}</code>
              )}
              <div className="flex flex-wrap gap-2 items-center justify-between">
                <Badge variant={getConfidenceVariant(rule.confidence)}>{rule.confidence}</Badge>
                <button
                  onClick={() => toggleActive(rule)}
                  className="inline-flex gap-1 items-center transition-colors hover:text-primary"
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
          ))}
        </div>
        </>
      )}

      {/* Edit / Create Dialog */}
      <Dialog open={isCreating || editingRule !== null} onOpenChange={handleCancel}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isCreating ? 'Create' : 'Edit'} Detection Rule</DialogTitle>
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
              <label className="block mb-1 text-sm font-medium">Pattern (regex or keywords)</label>
              <input
                type="text"
                value={formData.pattern}
                onChange={(event) => setFormData({ ...formData, pattern: event.target.value })}
                className="px-3 py-2 w-full font-mono text-sm rounded-md border bg-background"
                placeholder="problem|issue|error|need help"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <ReactSelect
                label="Category"
                value={formData.category}
                onChange={(value) => setFormData({ ...formData, category: value as DetectionRuleCategory })}
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
                  onChange={(event) => setFormData({ ...formData, confidence: parseInt(event.target.value) })}
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
              <label htmlFor="active" className="text-sm">Active</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              <X className="mr-1 w-4 h-4" />
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!formData.name || !formData.description} className="gap-1">
              <Save className="w-4 h-4" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Detection Rule</DialogTitle>
            <DialogClose onClose={() => setDeleteDialogOpen(false)} />
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete &quot;{ruleToDelete?.name}&quot;? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
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
