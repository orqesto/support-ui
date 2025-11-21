import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Save, X, Eye, EyeOff, BookOpen } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog';
import { Select } from '@/components/ui/Select';
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

export const KnowledgeDetectionRulesSettings = () => {
  const [rules, setRules] = useState<KnowledgeDetectionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<KnowledgeDetectionRule | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<KnowledgeDetectionRule | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'pricing',
    pattern: '',
    exampleText: '',
    confidence: 30,
    active: true,
  });

  const fetchRules = async () => {
    try {
      setLoading(true);
      const data = await settingsService.getKnowledgeDetectionRules();
      setRules(data);
    } catch (error) {
      console.error('Error fetching KB detection rules:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules().catch((error) => {
      console.error('Failed to fetch rules:', error);
    });
  }, []);

  const handleEdit = (rule: KnowledgeDetectionRule) => {
    setEditingRule(rule);
    setError('');
    setSuccess('');
    setFormData({
      name: rule.name,
      description: rule.description,
      category: rule.category,
      pattern: rule.pattern ?? '',
      exampleText: rule.exampleText,
      confidence: rule.confidence,
      active: rule.active,
    });
  };

  const handleCreate = () => {
    setIsCreating(true);
    setError('');
    setSuccess('');
    setFormData({
      name: '',
      description: '',
      category: 'pricing',
      pattern: '',
      exampleText: '',
      confidence: 30,
      active: true,
    });
  };

  const validateForm = () => {
    if (!formData.name.trim()) {
      setError('Name is required');
      return false;
    }
    if (!formData.description.trim()) {
      setError('Description is required');
      return false;
    }
    if (!formData.category) {
      setError('Category is required');
      return false;
    }
    if (!formData.exampleText.trim()) {
      setError(
        'Example text is required - it is used to generate embeddings for semantic matching'
      );
      return false;
    }
    if (formData.confidence < 0 || formData.confidence > 100) {
      setError('Confidence must be between 0 and 100');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    setError('');
    setSuccess('');

    if (!validateForm()) {
      return;
    }

    setIsSaving(true);

    try {
      if (editingRule) {
        await settingsService.updateKnowledgeDetectionRule(editingRule.id, formData);
        setSuccess('Rule updated successfully!');
      } else if (isCreating) {
        await settingsService.createKnowledgeDetectionRule(formData);
        setSuccess('Rule created successfully!');
      }
      await fetchRules();

      // Close dialog after short delay to show success message
      setTimeout(() => {
        setEditingRule(null);
        setIsCreating(false);
        setSuccess('');
      }, 1500);
    } catch (err) {
      const errorMessage = (err as { response?: { data?: { error?: string } } })?.response?.data
        ?.error;
      setError(errorMessage ?? 'Failed to save rule. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditingRule(null);
    setIsCreating(false);
    setError('');
    setSuccess('');
  };

  const handleDeleteClick = (rule: KnowledgeDetectionRule) => {
    setRuleToDelete(rule);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!ruleToDelete) return;
    try {
      await settingsService.deleteKnowledgeDetectionRule(ruleToDelete.id);
      await fetchRules();
      setDeleteDialogOpen(false);
      setRuleToDelete(null);
    } catch (error) {
      console.error('Error deleting KB detection rule:', error);
    }
  };

  const toggleActive = async (rule: KnowledgeDetectionRule) => {
    try {
      await settingsService.updateKnowledgeDetectionRule(rule.id, { active: !rule.active });
      await fetchRules();
    } catch (error) {
      console.error('Error toggling KB detection rule:', error);
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      pricing: 'bg-green-100 text-green-800',
      policy: 'bg-blue-100 text-blue-800',
      process: 'bg-purple-100 text-purple-800',
      technical: 'bg-orange-100 text-orange-800',
      delivery: 'bg-cyan-100 text-cyan-800',
      features: 'bg-indigo-100 text-indigo-800',
      compliance: 'bg-red-100 text-red-800',
    };
    return colors[category] ?? 'bg-gray-100 text-gray-800';
  };

  const categoryStats = CATEGORIES.map((cat) => ({
    ...cat,
    count: rules.filter((r) => r.category === cat.value && r.active).length,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-start">
        <div>
          <h2 className="flex gap-2 items-center text-xl font-semibold">
            <BookOpen className="w-5 h-5" />
            Knowledge Detection Rules
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure semantic rules to detect valuable knowledge during KB ingestion (pricing,
            policies, specs, etc.)
          </p>
        </div>
        <Button onClick={handleCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Rule
        </Button>
      </div>

      {/* Category Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        {categoryStats.map((cat) => (
          <div key={cat.value} className="p-3 rounded-lg border bg-card" title={cat.description}>
            <div className="text-xs font-medium text-muted-foreground">{cat.label}</div>
            <div className="mt-1 text-2xl font-bold">{cat.count}</div>
          </div>
        ))}
      </div>

      {/* Rules Table */}
      {loading ? (
        <div className="py-12 text-center text-muted-foreground">Loading rules...</div>
      ) : rules.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          No KB detection rules configured. Add your first rule to get started.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
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
                <th className="px-4 py-3 text-xs font-medium tracking-wider text-center uppercase text-muted-foreground">
                  Confidence
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
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3 text-sm font-medium whitespace-nowrap">{rule.name}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${getCategoryColor(rule.category)}`}
                    >
                      {rule.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-md text-sm truncate text-muted-foreground">
                    {rule.description}
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    <Badge variant="default">{rule.confidence}</Badge>
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
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(rule)}
                        className="gap-1"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(rule)}
                        className="gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
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
      )}

      {/* Edit/Create Dialog */}
      <Dialog open={isCreating || editingRule !== null} onOpenChange={handleCancel}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isCreating ? 'Create' : 'Edit'} Knowledge Detection Rule</DialogTitle>
          </DialogHeader>

          {/* Success Message */}
          {success && (
            <div className="p-3 text-sm text-green-700 bg-green-50 rounded-md dark:bg-green-900/20 dark:text-green-400">
              {success}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 text-sm rounded-md text-destructive bg-destructive/10">{error}</div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block mb-1 text-sm font-medium">
                Name
              </label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="px-3 py-2 w-full rounded-md border bg-background"
                placeholder="e.g., pricing_information"
              />
            </div>

            <div>
              <label htmlFor="description" className="block mb-1 text-sm font-medium">
                Description
              </label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="px-3 py-2 w-full rounded-md border bg-background"
                placeholder="Describe what this rule detects..."
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label} - {cat.description}
                  </option>
                ))}
              </Select>

              <div>
                <label htmlFor="confidence" className="block mb-1 text-sm font-medium">
                  Confidence (0-100)
                </label>
                <input
                  id="confidence"
                  type="number"
                  min="0"
                  max="100"
                  value={formData.confidence}
                  onChange={(e) =>
                    setFormData({ ...formData, confidence: parseInt(e.target.value) || 0 })
                  }
                  className="px-3 py-2 w-full rounded-md border bg-background"
                />
              </div>
            </div>

            <div>
              <label htmlFor="exampleText" className="block mb-1 text-sm font-medium">
                Example Text (Required)
              </label>
              <textarea
                id="exampleText"
                value={formData.exampleText}
                onChange={(e) => setFormData({ ...formData, exampleText: e.target.value })}
                className="px-3 py-2 w-full rounded-md border bg-background"
                placeholder="Provide an example of text this rule should detect (used for semantic matching)..."
                rows={4}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                This text is used to generate an embedding for semantic similarity matching.
              </p>
            </div>

            <div>
              <label htmlFor="pattern" className="block mb-1 text-sm font-medium">
                Pattern (Optional)
              </label>
              <input
                id="pattern"
                type="text"
                value={formData.pattern}
                onChange={(e) => setFormData({ ...formData, pattern: e.target.value })}
                className="px-3 py-2 w-full rounded-md border bg-background"
                placeholder="Optional regex pattern or keywords"
              />
            </div>

            <div className="flex gap-2 items-center">
              <input
                type="checkbox"
                id="active"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="active" className="text-sm">
                Active
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
              <X className="mr-1 w-4 h-4" />
              Cancel
            </Button>
            <Button onClick={handleSave} className="gap-1" disabled={isSaving}>
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Knowledge Detection Rule</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete &quot;{ruleToDelete?.name}&quot;? This action cannot be
            undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
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
