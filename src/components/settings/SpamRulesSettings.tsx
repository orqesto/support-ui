import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Plus, Edit2, Trash2, Save, X, Eye, EyeOff } from 'lucide-react';
import { settingsService, type SpamRule } from '@/services/settings.service';
import { Badge } from '../ui/Badge';
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter, DialogClose } from '../ui/Dialog';

export const SpamRulesSettings = () => {
  const [rules, setRules] = useState<SpamRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<SpamRule | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<SpamRule | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    pattern: '',
    category: 'content',
    severity: 10,
    active: true,
  });

  const fetchRules = async () => {
    try {
      setLoading(true);
      const data = await settingsService.getSpamRules();
      setRules(data);
    } catch (error) {
      console.error('Error fetching spam rules:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleEdit = (rule: SpamRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      description: rule.description,
      pattern: rule.pattern || '',
      category: rule.category,
      severity: rule.severity,
      active: rule.active,
    });
  };

  const handleCreate = () => {
    setIsCreating(true);
    setFormData({ name: '', description: '', pattern: '', category: 'content', severity: 10, active: true });
  };

  const handleSave = async () => {
    try {
      if (editingRule) {
        await settingsService.updateSpamRule(editingRule.id, formData);
      } else if (isCreating) {
        await settingsService.createSpamRule(formData);
      }
      await fetchRules();
      setEditingRule(null);
      setIsCreating(false);
      setFormData({ name: '', description: '', pattern: '', category: 'content', severity: 10, active: true });
    } catch (error) {
      console.error('Error saving rule:', error);
    }
  };

  const handleCancel = () => {
    setEditingRule(null);
    setIsCreating(false);
    setFormData({ name: '', description: '', pattern: '', category: 'content', severity: 10, active: true });
  };

  const handleDeleteClick = (rule: SpamRule) => {
    setRuleToDelete(rule);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!ruleToDelete) return;
    try {
      await settingsService.deleteSpamRule(ruleToDelete.id);
      await fetchRules();
      setDeleteDialogOpen(false);
      setRuleToDelete(null);
    } catch (error) {
      console.error('Error deleting rule:', error);
    }
  };

  const toggleActive = async (rule: SpamRule) => {
    try {
      await settingsService.updateSpamRule(rule.id, { active: !rule.active });
      await fetchRules();
    } catch (error) {
      console.error('Error toggling rule:', error);
    }
  };

  const getSeverityColor = (severity: number) => {
    if (severity >= 30) return 'danger';
    if (severity >= 20) return 'warning';
    return 'default';
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Spam Detection Rules</h3>
          <p className="text-sm text-muted-foreground">
            Configure rules and red flags for spam detection
          </p>
        </div>
        <Button onClick={handleCreate} disabled={isCreating}>
          <Plus className="h-4 w-4 mr-2" />
          Add Rule
        </Button>
      </div>

      {/* Info Banner */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm text-yellow-900">
          <strong>Pattern Matching:</strong> Use regex or keywords separated by <code className="bg-yellow-100 px-1 rounded">|</code> (pipe).
          Higher severity scores (0-100) have more impact on spam detection.
        </p>
      </div>

      {/* New Rule Form */}
      {isCreating && (
        <div className="border rounded-lg p-4 bg-red-50 space-y-4">
          <h4 className="font-semibold">New Spam Rule</h4>
          <div className="grid gap-4">
            <div>
              <label className="text-sm font-medium">Rule Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="e.g., phishing_indicators"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="What this rule detects"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Pattern (regex or keywords)</label>
              <input
                type="text"
                value={formData.pattern}
                onChange={(e) => setFormData({ ...formData, pattern: e.target.value })}
                className="w-full px-3 py-2 border rounded-md font-mono text-sm"
                placeholder="verify your account|confirm identity|suspended"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="sender">Sender</option>
                  <option value="subject">Subject</option>
                  <option value="content">Content</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Severity (0-100)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={formData.severity}
                  onChange={(e) => setFormData({ ...formData, severity: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
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
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
            <Button variant="outline" onClick={handleCancel}>
              <X className="h-4 w-4 mr-2" />
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
            className={`border rounded-lg p-4 ${
              editingRule?.id === rule.id ? 'bg-red-50' : 'bg-white'
            }`}
          >
            {editingRule?.id === rule.id ? (
              <div className="space-y-4">
                <h4 className="font-semibold">Edit Spam Rule</h4>
                <div className="grid gap-4">
                  <div>
                    <label className="text-sm font-medium">Rule Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border rounded-md"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Description</label>
                    <input
                      type="text"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-3 py-2 border rounded-md"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Pattern</label>
                    <input
                      type="text"
                      value={formData.pattern}
                      onChange={(e) => setFormData({ ...formData, pattern: e.target.value })}
                      className="w-full px-3 py-2 border rounded-md font-mono text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Category</label>
                      <select
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md"
                      >
                        <option value="sender">Sender</option>
                        <option value="subject">Subject</option>
                        <option value="content">Content</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Severity</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={formData.severity}
                        onChange={(e) => setFormData({ ...formData, severity: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border rounded-md"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
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
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </Button>
                  <Button variant="outline" onClick={handleCancel}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-lg">{rule.name}</h4>
                      <Badge variant={rule.active ? 'success' : 'default'}>
                        {rule.active ? 'Active' : 'Inactive'}
                      </Badge>
                      <Badge variant={getSeverityColor(rule.severity)}>
                        Severity: {rule.severity}
                      </Badge>
                      <Badge variant="secondary" className="capitalize">
                        {rule.category}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {rule.description}
                    </p>
                    {rule.pattern && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          Pattern:
                        </p>
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
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
                      {rule.active ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleEdit(rule)}>
                      <Edit2 className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDeleteClick(rule)}
                    >
                      <Trash2 className="h-3 w-3" />
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
          <DialogTitle>Delete Spam Rule</DialogTitle>
          <DialogClose onClose={() => setDeleteDialogOpen(false)} />
        </DialogHeader>
        <DialogContent>
          <p>Are you sure you want to delete this spam detection rule?</p>
          {ruleToDelete && (
            <div className="mt-4 p-4 bg-gray-50 rounded">
              <p className="text-sm font-medium">{ruleToDelete.name}</p>
              <p className="text-xs text-muted-foreground mt-1">{ruleToDelete.description}</p>
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
