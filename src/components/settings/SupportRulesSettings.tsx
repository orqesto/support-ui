import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Save, X, Eye, EyeOff } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from '@/components/ui/Dialog';
import { Select } from '@/components/ui/Select';
import {
  supportRuleService,
  type SupportRule,
  type SupportRuleCategory,
} from '@/services/supportRule.service';

export const SupportRulesSettings = () => {
  const [rules, setRules] = useState<SupportRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<SupportRule | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<SupportRule | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    pattern: string;
    category: SupportRuleCategory;
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
      const response = await supportRuleService.getAll();
      if (response.success && response.data) {
        setRules(response.data);
      }
    } catch (error) {
      console.error('Error fetching support rules:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules().catch((error) => {
      console.error('Failed to fetch rules:', error);
    });
  }, []);

  const handleEdit = (rule: SupportRule) => {
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
    setFormData({
      name: '',
      description: '',
      pattern: '',
      category: 'issue',
      confidence: 20,
      active: true,
    });
  };

  const handleSave = async () => {
    try {
      if (editingRule) {
        await supportRuleService.update(editingRule.id, formData);
      } else if (isCreating) {
        await supportRuleService.create(formData);
      }
      await fetchRules();
      setEditingRule(null);
      setIsCreating(false);
      setFormData({
        name: '',
        description: '',
        pattern: '',
        category: 'issue',
        confidence: 20,
        active: true,
      });
    } catch (error) {
      console.error('Error saving rule:', error);
    }
  };

  const handleCancel = () => {
    setEditingRule(null);
    setIsCreating(false);
    setFormData({
      name: '',
      description: '',
      pattern: '',
      category: 'issue',
      confidence: 20,
      active: true,
    });
  };

  const handleDeleteClick = (rule: SupportRule) => {
    setRuleToDelete(rule);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!ruleToDelete) {
      return;
    }
    try {
      await supportRuleService.delete(ruleToDelete.id);
      await fetchRules();
      setDeleteDialogOpen(false);
      setRuleToDelete(null);
    } catch (error) {
      console.error('Error deleting rule:', error);
    }
  };

  const toggleActive = async (rule: SupportRule) => {
    try {
      await supportRuleService.update(rule.id, { active: !rule.active });
      await fetchRules();
    } catch (error) {
      console.error('Error toggling rule:', error);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 30) {
      return 'success';
    }
    if (confidence >= 20) {
      return 'default';
    }
    return 'secondary';
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Support Detection Rules</h3>
          <p className="text-sm text-muted-foreground">
            Configure patterns to identify legitimate support requests
          </p>
        </div>
        <Button onClick={handleCreate} disabled={isCreating}>
          <Plus className="mr-2 w-4 h-4" />
          Add Rule
        </Button>
      </div>

      {/* Info Banner */}
      <div className="p-4 rounded-lg border bg-blue-500/10 dark:bg-blue-500/10 border-blue-500/20">
        <p className="text-sm text-blue-600 dark:text-blue-400">
          <strong>Pattern Matching:</strong> Use regex or keywords separated by{' '}
          <code className="px-1 rounded bg-blue-500/20">|</code> (pipe). Higher confidence scores
          (0-100) indicate stronger support signals.
        </p>
      </div>

      {/* New Rule Form */}
      {isCreating && (
        <div className="p-4 space-y-4 rounded-lg border bg-card border-border">
          <h4 className="font-semibold">New Support Rule</h4>
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
                placeholder="e.g., urgent_customer_issue"
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
                placeholder="problem|issue|error|need help"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Category"
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value as SupportRuleCategory })
                }
              >
                <option value="issue">Issue</option>
                <option value="help">Help Request</option>
                <option value="question">Question</option>
                <option value="access">Access</option>
                <option value="account">Account</option>
                <option value="urgent">Urgent</option>
              </Select>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label htmlFor="confidence" className="text-sm font-medium">
                    Confidence
                  </label>
                  <span className="text-sm font-medium text-primary">
                    {formData.confidence}
                    {formData.confidence >= 30 && ' ✅ Strong Signal'}
                    {formData.confidence >= 20 && formData.confidence < 30 && ' ℹ️ Moderate Signal'}
                    {formData.confidence < 20 && ' ⚡ Weak Signal'}
                  </span>
                </div>
                <input
                  type="range"
                  id="confidence"
                  min="0"
                  max="100"
                  step="5"
                  value={formData.confidence}
                  onChange={(e) => setFormData({ ...formData, confidence: parseInt(e.target.value) })}
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
          <div
            key={rule.id}
            className="border border-border rounded-lg p-4 bg-card"
          >
            {editingRule?.id === rule.id ? (
              <div className="space-y-4">
                <h4 className="font-semibold">Edit Support Rule</h4>
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
                    <Select
                      label="Category"
                      value={formData.category}
                      onChange={(e) =>
                        setFormData({ ...formData, category: e.target.value as SupportRuleCategory })
                      }
                    >
                      <option value="issue">Issue</option>
                      <option value="help">Help Request</option>
                      <option value="question">Question</option>
                      <option value="access">Access</option>
                      <option value="account">Account</option>
                      <option value="urgent">Urgent</option>
                    </Select>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label htmlFor="confidence-edit" className="text-sm font-medium">
                          Confidence
                        </label>
                        <span className="text-sm font-medium text-primary">
                          {formData.confidence}
                          {formData.confidence >= 30 && ' ✅ Strong Signal'}
                          {formData.confidence >= 20 && formData.confidence < 30 && ' ℹ️ Moderate Signal'}
                          {formData.confidence < 20 && ' ⚡ Weak Signal'}
                        </span>
                      </div>
                      <input
                        type="range"
                        id="confidence-edit"
                        min="0"
                        max="100"
                        step="5"
                        value={formData.confidence}
                        onChange={(e) =>
                          setFormData({ ...formData, confidence: parseInt(e.target.value) })
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
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex flex-wrap gap-2 items-center">
                      <h4 className="text-lg font-semibold">{rule.name}</h4>
                      <Badge variant={rule.active ? 'success' : 'default'}>
                        {rule.active ? 'Active' : 'Inactive'}
                      </Badge>
                      <Badge variant={getConfidenceColor(rule.confidence)}>
                        Confidence: {rule.confidence}
                      </Badge>
                      <Badge variant="secondary" className="capitalize">
                        {rule.category}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{rule.description}</p>
                    {rule.pattern && (
                      <div className="mt-2">
                        <p className="mb-1 text-xs font-medium text-muted-foreground">Pattern:</p>
                        <code className="px-2 py-1 font-mono text-xs rounded bg-muted">
                          {rule.pattern}
                        </code>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleActive(rule)}
                      title={rule.active ? 'Deactivate' : 'Activate'}
                    >
                      {rule.active ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleEdit(rule)}>
                      <Edit2 className="mr-2 w-4 h-4" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDeleteClick(rule)}
                      aria-label="Delete support rule"
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
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogHeader>
          <DialogTitle>Delete Support Rule</DialogTitle>
          <DialogClose onClose={() => setDeleteDialogOpen(false)} />
        </DialogHeader>
        <DialogContent>
          <p>Are you sure you want to delete this support detection rule?</p>
          {ruleToDelete && (
            <div className="p-4 mt-4 rounded bg-muted">
              <p className="text-sm font-medium">{ruleToDelete.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{ruleToDelete.description}</p>
            </div>
          )}
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDeleteConfirm}>
            Delete
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
};
