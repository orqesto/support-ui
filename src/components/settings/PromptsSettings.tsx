import { useEffect, useState } from 'react';
import { Plus, Edit2, Save, X, Eye, EyeOff } from 'lucide-react';
import DepartmentBadge from '@/components/DepartmentBadge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { settingsService, type PromptTemplate } from '@/services/settings.service';

export const PromptsSettings = () => {
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPrompt, setEditingPrompt] = useState<PromptTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    prompt: '',
    active: true,
  });

  const fetchPrompts = async () => {
    try {
      setLoading(true);
      const data = await settingsService.getPromptTemplates();
      setPrompts(data);
    } catch (error) {
      console.error('Error fetching prompts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrompts().catch((error) => {
      console.error('Failed to fetch prompts:', error);
    });
  }, []);

  const handleEdit = (prompt: PromptTemplate) => {
    setEditingPrompt(prompt);
    setFormData({
      name: prompt.name,
      description: prompt.description ?? '',
      prompt: prompt.prompt,
      active: prompt.active,
    });
  };

  const handleCreate = () => {
    setIsCreating(true);
    setFormData({ name: '', description: '', prompt: '', active: true });
  };

  const handleSave = async () => {
    try {
      if (editingPrompt) {
        await settingsService.updatePromptTemplate(editingPrompt.id, formData);
      } else if (isCreating) {
        await settingsService.createPromptTemplate(formData);
      }
      await fetchPrompts();
      setEditingPrompt(null);
      setIsCreating(false);
      setFormData({ name: '', description: '', prompt: '', active: true });
    } catch (error) {
      console.error('Error saving prompt:', error);
    }
  };

  const handleCancel = () => {
    setEditingPrompt(null);
    setIsCreating(false);
    setFormData({ name: '', description: '', prompt: '', active: true });
  };

  const toggleActive = async (prompt: PromptTemplate) => {
    try {
      await settingsService.updatePromptTemplate(prompt.id, { active: !prompt.active });
      await fetchPrompts();
    } catch (error) {
      console.error('Error toggling prompt:', error);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">AI Prompt Templates</h3>
          <p className="text-sm text-muted-foreground">
            Customize prompts used by AI for message analysis and spam detection
          </p>
        </div>
        <Button onClick={handleCreate} disabled={isCreating}>
          <Plus className="mr-2 w-4 h-4" />
          Add Prompt
        </Button>
      </div>

      {/* Info Banner */}
      <div className="p-4 rounded-lg border bg-blue-500/10 dark:bg-blue-500/10 border-blue-500/20">
        <p className="text-sm text-blue-600 dark:text-blue-400">
          <strong>Template Variables:</strong> Use{' '}
          <code className="px-1 rounded bg-blue-500/20">{'{{variable}}'}</code> for dynamic content.
          Available: <code className="px-1 rounded bg-blue-500/20">{'{{subject}}'}</code>,{' '}
          <code className="px-1 rounded bg-blue-500/20">{'{{sender}}'}</code>,{' '}
          <code className="px-1 rounded bg-blue-500/20">{'{{content}}'}</code>,{' '}
          <code className="px-1 rounded bg-blue-500/20">{'{{spam_rules}}'}</code>
        </p>
      </div>

      {/* New Prompt Form */}
      {isCreating && (
        <div className="p-4 space-y-4 rounded-lg border bg-green-500/10 dark:bg-green-500/10 border-green-500/20">
          <h4 className="font-semibold">New Prompt Template</h4>
          <div className="grid gap-4">
            <div>
              <label htmlFor="name" className="text-sm font-medium">
                Name (unique identifier)
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="px-3 py-2 w-full font-mono text-sm rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                placeholder="e.g., message_analysis"
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
                placeholder="What this prompt is used for"
              />
            </div>
            <div>
              <label htmlFor="prompt" className="text-sm font-medium">
                Prompt Template
              </label>
              <textarea
                value={formData.prompt}
                onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
                className="px-3 py-2 w-full font-mono text-sm rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary"
                rows={12}
              />
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
                Active (use this template)
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={!formData.name || !formData.prompt}>
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

      {/* Prompts List */}
      <div className="space-y-4">
        {prompts.map((prompt) => (
          <div
            key={prompt.id}
            className={`border border-border rounded-lg p-4 ${
              editingPrompt?.id === prompt.id ? 'bg-green-500/10 dark:bg-green-500/10' : 'bg-card'
            }`}
          >
            {editingPrompt?.id === prompt.id ? (
              <div className="space-y-4">
                <h4 className="font-semibold">Edit Prompt Template</h4>
                <div className="grid gap-4">
                  <div>
                    <label className="text-sm font-medium">
                      Name
                      {editingPrompt?.type === 'system' && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (System template - readonly)
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      disabled={editingPrompt?.type === 'system'}
                      className="px-3 py-2 w-full font-mono text-sm rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-muted"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">
                      Description
                      {editingPrompt?.type === 'system' && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (System template - readonly)
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      disabled={editingPrompt?.type === 'system'}
                      className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-muted"
                    />
                  </div>
                  <div>
                    <label htmlFor="prompt" className="text-sm font-medium">
                      Prompt Template
                    </label>
                    <textarea
                      value={formData.prompt}
                      onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
                      className="px-3 py-2 w-full font-mono text-sm rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary"
                      rows={12}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Characters: {formData.prompt.length}
                    </p>
                  </div>
                  <div className="flex gap-2 items-center">
                    <input
                      type="checkbox"
                      id={`active-${prompt.id}`}
                      checked={formData.active}
                      onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                      className="rounded"
                    />
                    <label htmlFor={`active-${prompt.id}`} className="text-sm font-medium">
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
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <div className="flex gap-2 items-center">
                      <h4 className="font-mono text-lg font-semibold">{prompt.name}</h4>
                      <DepartmentBadge department={prompt.departmentRole} size="sm" />
                      {prompt.type === 'system' && <Badge variant="default">System</Badge>}
                      <Badge variant={prompt.active ? 'success' : 'default'}>
                        {prompt.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    {prompt.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{prompt.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleActive(prompt)}
                      title={prompt.active ? 'Deactivate' : 'Activate'}
                    >
                      {prompt.active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleEdit(prompt)}>
                      <Edit2 className="mr-2 w-4 h-4" />
                      Edit
                    </Button>
                  </div>
                </div>
                <details className="group">
                  <summary className="text-sm text-blue-600 cursor-pointer hover:text-blue-800">
                    View Prompt Template ({prompt.prompt.length} characters)
                  </summary>
                  <div className="p-3 mt-3 rounded-lg border bg-muted border-border">
                    <pre className="overflow-auto max-h-96 font-mono text-xs whitespace-pre-wrap">
                      {prompt.prompt}
                    </pre>
                  </div>
                </details>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
