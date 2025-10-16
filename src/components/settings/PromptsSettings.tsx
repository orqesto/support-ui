import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Plus, Edit2, Save, X, Eye, EyeOff } from 'lucide-react';
import { settingsService, type PromptTemplate } from '@/services/settings.service';
import { Badge } from '../ui/Badge';

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
    fetchPrompts();
  }, []);

  const handleEdit = (prompt: PromptTemplate) => {
    setEditingPrompt(prompt);
    setFormData({
      name: prompt.name,
      description: prompt.description || '',
      prompt: prompt.prompt,
      active: prompt.active,
    });
  };

  const handleCreate = () => {
    setIsCreating(true);
    setFormData({ name: '',description: '', prompt: '', active: true });
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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">AI Prompt Templates</h3>
          <p className="text-sm text-muted-foreground">
            Customize prompts used by AI for message analysis and spam detection
          </p>
        </div>
        <Button onClick={handleCreate} disabled={isCreating}>
          <Plus className="h-4 w-4 mr-2" />
          Add Prompt
        </Button>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-900">
          <strong>Template Variables:</strong> Use <code className="bg-blue-100 px-1 rounded">{'{{variable}}'}</code> for dynamic content.
          Available: <code className="bg-blue-100 px-1 rounded">{'{{subject}}'}</code>,{' '}
          <code className="bg-blue-100 px-1 rounded">{'{{sender}}'}</code>,{' '}
          <code className="bg-blue-100 px-1 rounded">{'{{content}}'}</code>,{' '}
          <code className="bg-blue-100 px-1 rounded">{'{{spam_rules}}'}</code>
        </p>
      </div>

      {/* New Prompt Form */}
      {isCreating && (
        <div className="border rounded-lg p-4 bg-green-50 space-y-4">
          <h4 className="font-semibold">New Prompt Template</h4>
          <div className="grid gap-4">
            <div>
              <label className="text-sm font-medium">Name (unique identifier)</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-md font-mono text-sm"
                placeholder="e.g., message_analysis"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="What this prompt is used for"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Prompt Template</label>
              <textarea
                value={formData.prompt}
                onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
                className="w-full px-3 py-2 border rounded-md font-mono text-sm"
                rows={12}
                placeholder="Your prompt here... Use {{variable}} for dynamic content"
              />
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
                Active (use this template)
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={!formData.name || !formData.prompt}>
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

      {/* Prompts List */}
      <div className="space-y-4">
        {prompts.map((prompt) => (
          <div
            key={prompt.id}
            className={`border rounded-lg p-4 ${
              editingPrompt?.id === prompt.id ? 'bg-green-50' : 'bg-white'
            }`}
          >
            {editingPrompt?.id === prompt.id ? (
              <div className="space-y-4">
                <h4 className="font-semibold">Edit Prompt Template</h4>
                <div className="grid gap-4">
                  <div>
                    <label className="text-sm font-medium">Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border rounded-md font-mono text-sm"
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
                    <label className="text-sm font-medium">Prompt Template</label>
                    <textarea
                      value={formData.prompt}
                      onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
                      className="w-full px-3 py-2 border rounded-md font-mono text-sm"
                      rows={12}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Characters: {formData.prompt.length}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
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
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-lg font-mono">{prompt.name}</h4>
                      <Badge variant={prompt.active ? 'success' : 'default'}>
                        {prompt.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    {prompt.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {prompt.description}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleActive(prompt)}
                      title={prompt.active ? 'Deactivate' : 'Activate'}
                    >
                      {prompt.active ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleEdit(prompt)}>
                      <Edit2 className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                  </div>
                </div>
                <details className="group">
                  <summary className="cursor-pointer text-sm text-blue-600 hover:text-blue-800">
                    View Prompt Template ({prompt.prompt.length} characters)
                  </summary>
                  <div className="mt-3 p-3 bg-gray-50 rounded-lg border">
                    <pre className="text-xs whitespace-pre-wrap font-mono overflow-auto max-h-96">
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
