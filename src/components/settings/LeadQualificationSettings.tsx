import { useEffect, useState } from 'react';
import { Plus, Trash2, Target, Info, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  organizationService,
  type OrgLeadConfig,
  type LeadQualificationFieldConfig,
  type LeadCategoryConfig,
} from '@/services/organization.service';

const ALL_DEPARTMENTS = ['sales', 'support', 'billing', 'info', 'hr'] as const;
const ALL_CONTACT_FIELDS = ['name', 'email', 'phone', 'company'] as const;
const PRIORITY_OPTIONS = ['high', 'medium', 'low'] as const;

const inputCls =
  'px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary text-sm';
const labelCls = 'block text-xs font-medium text-muted-foreground mb-1';

const DEFAULT_CONFIG: OrgLeadConfig = {
  departments: ['sales'],
  requiredContactFields: ['name', 'email'],
  autoMarkNewSenders: false,
  qualificationFields: [],
  categories: [],
};

export const LeadQualificationSettings = () => {
  const [config, setConfig] = useState<OrgLeadConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New field form
  const [newField, setNewField] = useState<LeadQualificationFieldConfig>({
    key: '',
    label: '',
    required: false,
  });
  const [addingField, setAddingField] = useState(false);

  // New category form
  const [newCategory, setNewCategory] = useState<LeadCategoryConfig>({
    key: '',
    label: '',
    priority: 'medium',
    autoEscalate: false,
  });
  const [addingCategory, setAddingCategory] = useState(false);

  useEffect(() => {
    organizationService
      .getLeadConfig()
      .then(setConfig)
      .catch(() => setError('Failed to load lead qualification settings'))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    try {
      setSaving(true);
      setError(null);
      await organizationService.updateLeadConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const toggleDept = (dept: string) => {
    setConfig((cfg) => ({
      ...cfg,
      departments: cfg.departments.includes(dept)
        ? cfg.departments.filter((dep) => dep !== dept)
        : [...cfg.departments, dept],
    }));
  };

  const toggleContactField = (field: OrgLeadConfig['requiredContactFields'][number]) => {
    setConfig((cfg) => ({
      ...cfg,
      requiredContactFields: cfg.requiredContactFields.includes(field)
        ? cfg.requiredContactFields.filter((fld) => fld !== field)
        : [...cfg.requiredContactFields, field],
    }));
  };

  const addField = () => {
    if (!newField.key.trim() || !newField.label.trim()) return;
    const key = newField.key.trim().toLowerCase().replace(/\s+/g, '_');
    if (config.qualificationFields.some((fld) => fld.key === key)) return;
    setConfig((cfg) => ({
      ...cfg,
      qualificationFields: [...cfg.qualificationFields, { ...newField, key }],
    }));
    setNewField({ key: '', label: '', required: false });
    setAddingField(false);
  };

  const removeField = (key: string) => {
    setConfig((cfg) => ({
      ...cfg,
      qualificationFields: cfg.qualificationFields.filter((fld) => fld.key !== key),
    }));
  };

  const updateField = (key: string, patch: Partial<LeadQualificationFieldConfig>) => {
    setConfig((cfg) => ({
      ...cfg,
      qualificationFields: cfg.qualificationFields.map((fld) =>
        fld.key === key ? { ...fld, ...patch } : fld
      ),
    }));
  };

  const addCategory = () => {
    if (!newCategory.key.trim() || !newCategory.label.trim()) return;
    const key = newCategory.key.trim().toLowerCase().replace(/\s+/g, '_');
    if (config.categories.some((cat) => cat.key === key)) return;
    setConfig((cfg) => ({
      ...cfg,
      categories: [...cfg.categories, { ...newCategory, key }],
    }));
    setNewCategory({ key: '', label: '', priority: 'medium', autoEscalate: false });
    setAddingCategory(false);
  };

  const removeCategory = (key: string) => {
    setConfig((cfg) => ({
      ...cfg,
      categories: cfg.categories.filter((cat) => cat.key !== key),
    }));
  };

  const updateCategory = (key: string, patch: Partial<LeadCategoryConfig>) => {
    setConfig((cfg) => ({
      ...cfg,
      categories: cfg.categories.map((cat) => (cat.key === key ? { ...cat, ...patch } : cat)),
    }));
  };

  if (loading) return <div className="py-12 text-center text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-violet-500/10">
          <Target className="w-5 h-5 text-violet-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Lead Qualification</h2>
          <p className="text-sm text-muted-foreground">
            Configure multi-turn AI lead qualification — which departments use it, what to collect,
            and how to categorize leads.
          </p>
        </div>
      </div>

      {/* How it works */}
      <div className="p-4 rounded-lg border bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800">
        <div className="flex gap-2 items-start mb-3">
          <Info className="w-4 h-4 mt-0.5 text-blue-600 dark:text-blue-400 shrink-0" />
          <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100">How it works</h3>
        </div>
        <div className="flex flex-wrap gap-2 items-center text-xs text-blue-800 dark:text-blue-200 mb-3">
          <span className="px-2 py-1 rounded bg-blue-100 dark:bg-blue-900">Lead writes in</span>
          <ArrowRight className="w-3 h-3 shrink-0" />
          <span className="px-2 py-1 rounded bg-blue-100 dark:bg-blue-900">AI extracts info</span>
          <ArrowRight className="w-3 h-3 shrink-0" />
          <span className="px-2 py-1 rounded bg-blue-100 dark:bg-blue-900">Asks follow-up (up to 8 turns)</span>
          <ArrowRight className="w-3 h-3 shrink-0" />
          <span className="px-2 py-1 rounded bg-blue-100 dark:bg-blue-900">Category assigned → escalate</span>
        </div>
        <ul className="space-y-1.5 text-xs text-blue-800 dark:text-blue-200">
          <li>
            <span className="font-medium">Qualification Fields</span> — tell the AI what data to
            collect (e.g. budget, timeline). Answers accumulate across turns and are visible on the
            ticket.
          </li>
          <li>
            <span className="font-medium">Lead Categories</span> — once the AI has enough context it
            assigns the lead to a category (e.g. hot, warm, cold). Categories with{' '}
            <span className="font-medium">Auto-escalate</span> enabled immediately notify your team.
          </li>
          <li>
            <span className="font-medium">Auto-reply off?</span> — lead qualification still runs.
            The AI's next question is queued as a suggested answer for your agent to send manually.
          </li>
        </ul>
      </div>

      {error && (
        <div className="px-4 py-3 text-sm rounded-md border bg-destructive/10 text-destructive border-destructive/20">
          {error}
        </div>
      )}

      {/* Departments */}
      <div className="p-4 space-y-3 rounded-lg border">
        <div>
          <h3 className="text-sm font-semibold">Enabled Departments</h3>
          <p className="text-xs text-muted-foreground">
            Lead qualification runs for incoming messages in these departments.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {ALL_DEPARTMENTS.map((dept) => (
            <label key={dept} className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={config.departments.includes(dept)}
                onChange={() => toggleDept(dept)}
                className="rounded"
              />
              <span className="text-sm capitalize">{dept}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Contact fields */}
      <div className="p-4 space-y-3 rounded-lg border">
        <div>
          <h3 className="text-sm font-semibold">Required Contact Fields</h3>
          <p className="text-xs text-muted-foreground">
            Fields that must be collected before a lead is considered fully contacted.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {ALL_CONTACT_FIELDS.map((field) => (
            <label key={field} className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={config.requiredContactFields.includes(field)}
                onChange={() => toggleContactField(field)}
                className="rounded"
              />
              <span className="text-sm capitalize">{field}</span>
            </label>
          ))}
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
          <input
            type="checkbox"
            checked={config.autoMarkNewSenders}
            onChange={(event) => setConfig((cfg) => ({ ...cfg, autoMarkNewSenders: event.target.checked }))}
            className="rounded"
          />
          <div>
            <span className="text-sm">Auto-mark first-time senders as leads</span>
            <p className="text-xs text-muted-foreground">
              Immediately tags the message as a lead when the sender has never written before —
              before any AI processing.
            </p>
          </div>
        </label>
      </div>

      {/* Qualification fields */}
      <div className="p-4 space-y-3 rounded-lg border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Qualification Fields</h3>
            <p className="text-xs text-muted-foreground">
              Information the AI should collect from the lead. These are passed to the AI prompt as
              context.
            </p>
          </div>
          {!addingField && (
            <Button size="sm" variant="outline" onClick={() => setAddingField(true)}>
              <Plus className="mr-1 w-3 h-3" />
              Add field
            </Button>
          )}
        </div>

        {/* Existing fields */}
        {config.qualificationFields.length > 0 && (
          <div className="space-y-2">
            {config.qualificationFields.map((field) => (
              <div
                key={field.key}
                className="flex gap-2 items-center p-2 rounded border bg-muted/30"
              >
                <code className="px-1.5 py-0.5 text-xs rounded bg-muted font-mono shrink-0">
                  {field.key}
                </code>
                <input
                  type="text"
                  value={field.label}
                  onChange={(event) => updateField(field.key, { label: event.target.value })}
                  className="flex-1 px-2 py-1 text-sm rounded border bg-input"
                  placeholder="Label"
                />
                <label className="flex items-center gap-1 text-xs whitespace-nowrap cursor-pointer">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(event) => updateField(field.key, { required: event.target.checked })}
                    className="rounded"
                  />
                  Required
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeField(field.key)}
                  className="text-destructive hover:text-destructive shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Add field form */}
        {addingField && (
          <div className="p-3 space-y-3 rounded border bg-muted/20">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Key (snake_case)</label>
                <input
                  type="text"
                  value={newField.key}
                  onChange={(event) => setNewField((fld) => ({ ...fld, key: event.target.value }))}
                  className={inputCls}
                  placeholder="e.g. budget"
                />
              </div>
              <div>
                <label className={labelCls}>Label</label>
                <input
                  type="text"
                  value={newField.label}
                  onChange={(event) => setNewField((fld) => ({ ...fld, label: event.target.value }))}
                  className={inputCls}
                  placeholder="e.g. Budget range"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={newField.required}
                onChange={(event) => setNewField((fld) => ({ ...fld, required: event.target.checked }))}
                className="rounded"
              />
              Required before qualifying
            </label>
            <div className="flex gap-2">
              <Button size="sm" onClick={addField} disabled={!newField.key || !newField.label}>
                Add
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setAddingField(false);
                  setNewField({ key: '', label: '', required: false });
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {config.qualificationFields.length === 0 && !addingField && (
          <p className="text-xs text-muted-foreground italic">
            No fields configured — the AI prompt template drives extraction.
          </p>
        )}
      </div>

      {/* Lead categories */}
      <div className="p-4 space-y-3 rounded-lg border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Lead Categories</h3>
            <p className="text-xs text-muted-foreground">
              Categories the AI can assign to qualified leads. The AI prompt uses these as options.
            </p>
          </div>
          {!addingCategory && (
            <Button size="sm" variant="outline" onClick={() => setAddingCategory(true)}>
              <Plus className="mr-1 w-3 h-3" />
              Add category
            </Button>
          )}
        </div>

        {/* Existing categories */}
        {config.categories.length > 0 && (
          <div className="space-y-2">
            {config.categories.map((cat) => (
              <div
                key={cat.key}
                className="flex gap-2 items-center p-2 rounded border bg-muted/30"
              >
                <code className="px-1.5 py-0.5 text-xs rounded bg-muted font-mono shrink-0">
                  {cat.key}
                </code>
                <input
                  type="text"
                  value={cat.label}
                  onChange={(event) => updateCategory(cat.key, { label: event.target.value })}
                  className="flex-1 px-2 py-1 text-sm rounded border bg-input"
                  placeholder="Label"
                />
                <select
                  value={cat.priority}
                  onChange={(event) =>
                    updateCategory(cat.key, {
                      priority: event.target.value as LeadCategoryConfig['priority'],
                    })
                  }
                  className="px-2 py-1 text-xs rounded border bg-input"
                >
                  {PRIORITY_OPTIONS.map((prio) => (
                    <option key={prio} value={prio}>
                      {prio}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-xs whitespace-nowrap cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cat.autoEscalate ?? false}
                    onChange={(event) => updateCategory(cat.key, { autoEscalate: event.target.checked })}
                    className="rounded"
                  />
                  Auto-escalate
                  <span className="block text-xs text-muted-foreground font-normal leading-tight">
                    Notify team
                  </span>
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeCategory(cat.key)}
                  className="text-destructive hover:text-destructive shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Add category form */}
        {addingCategory && (
          <div className="p-3 space-y-3 rounded border bg-muted/20">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Key</label>
                <input
                  type="text"
                  value={newCategory.key}
                  onChange={(event) => setNewCategory((cat) => ({ ...cat, key: event.target.value }))}
                  className={inputCls}
                  placeholder="e.g. hot"
                />
              </div>
              <div>
                <label className={labelCls}>Label</label>
                <input
                  type="text"
                  value={newCategory.label}
                  onChange={(event) => setNewCategory((cat) => ({ ...cat, label: event.target.value }))}
                  className={inputCls}
                  placeholder="e.g. Hot Lead"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Priority</label>
                <select
                  value={newCategory.priority}
                  onChange={(event) =>
                    setNewCategory((cat) => ({
                      ...cat,
                      priority: event.target.value as LeadCategoryConfig['priority'],
                    }))
                  }
                  className={inputCls}
                >
                  {PRIORITY_OPTIONS.map((prio) => (
                    <option key={prio} value={prio}>
                      {prio.charAt(0).toUpperCase() + prio.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end pb-1.5">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={newCategory.autoEscalate ?? false}
                    onChange={(event) =>
                      setNewCategory((cat) => ({ ...cat, autoEscalate: event.target.checked }))
                    }
                    className="rounded"
                  />
                  Auto-escalate when assigned
                  <span className="block text-xs text-muted-foreground font-normal">
                    Notify team immediately
                  </span>
                </label>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={addCategory}
                disabled={!newCategory.key || !newCategory.label}
              >
                Add
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setAddingCategory(false);
                  setNewCategory({ key: '', label: '', priority: 'medium', autoEscalate: false });
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {config.categories.length === 0 && !addingCategory && (
          <p className="text-xs text-muted-foreground italic">
            No categories configured — the AI prompt template assigns categories freely.
          </p>
        )}
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button onClick={save} isLoading={saving} disabled={saving}>
          {saved ? 'Saved!' : 'Save Changes'}
        </Button>
        {saved && <span className="text-sm text-green-600">Settings saved.</span>}
      </div>
    </div>
  );
};
