import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Edit2, Eye, EyeOff, Filter, Plus, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { useDepartmentContextStore } from '@/stores/departmentContextStore';
import { useDepartments } from '@/hooks/useDepartments';
import { useAuthStore } from '@/stores/authStore';

export type RuleEditorColumn<TRule> = {
  header: string;
  align?: 'left' | 'center' | 'right';
  render: (rule: TRule) => React.ReactNode;
};

export type RuleEditorProps<
  TRule extends {
    id: number;
    name: string;
    description: string;
    pattern?: string | null;
    active: boolean;
    departmentId?: number | null;
  },
  TForm,
> = {
  title: string;
  description: string;
  dialogTitle: string;
  emptyMessage?: string;
  /**
   * Renders in place of the table + empty-message when the caller is not ready
   * to display data yet — e.g., Routing Rules needs a (source, dept) selection
   * before any list is meaningful. When unset, the normal empty-message flow
   * runs. Filter tabs and banners still render above; the Add button is hidden
   * while the placeholder is shown.
   */
  placeholder?: React.ReactNode;

  // From useRuleManagement
  loading: boolean;
  rules: TRule[];
  editingRule: TRule | null;
  isCreating: boolean;
  deleteDialogOpen: boolean;
  ruleToDelete: TRule | null;
  formData: TForm;
  setFormData: (data: TForm) => void;
  handleEdit: (rule: TRule) => void;
  handleCreate: () => void;
  handleCancel: () => void;
  handleSave: () => void;
  handleDeleteClick: (rule: TRule) => void;
  handleDeleteConfirm: () => void;
  handleDeleteCancel: () => void;

  // Desktop table columns: prefix = before Description, suffix = before Status
  prefixColumns?: RuleEditorColumn<TRule>[];
  suffixColumns?: RuleEditorColumn<TRule>[];

  // Form dialog content
  renderFormFields: (formData: TForm, setFormData: (data: TForm) => void) => React.ReactNode;
  isSaveDisabled?: (formData: TForm) => boolean;

  // Row action guards
  onToggleActive: (rule: TRule) => void;
  isToggleDisabled?: (rule: TRule) => boolean;
  toggleTitle?: (rule: TRule) => string | undefined;
  isEditDisabled?: (rule: TRule) => boolean;
  editTitle?: (rule: TRule) => string | undefined;
  isDeleteDisabled?: (rule: TRule) => boolean;
  deleteTitle?: (rule: TRule) => string | undefined;

  // Name cell badges (desktop + mobile row 1)
  renderNameMeta?: (rule: TRule) => React.ReactNode;
  // Mobile bottom-row left (suffix equivalent on mobile)
  renderMobileExtra?: (rule: TRule) => React.ReactNode;

  // Optional above-table sections
  renderBanners?: () => React.ReactNode;
  renderFilters?: () => React.ReactNode;

  // Optional display transform for the pattern column (table only — edit form gets raw value)
  renderPattern?: (pattern: string) => string;
};

const thClass = 'px-4 py-3 text-xs font-medium tracking-wider uppercase text-muted-foreground';

function alignClass(align?: 'left' | 'center' | 'right') {
  if (align === 'center') return 'text-center';
  if (align === 'right') return 'text-right';
  return 'text-left';
}

export function RuleEditor<
  TRule extends {
    id: number;
    name: string;
    description: string;
    pattern?: string | null;
    active: boolean;
    departmentId?: number | null;
  },
  TForm,
>({
  title,
  description,
  dialogTitle,
  emptyMessage = 'No rules configured. Add your first rule to get started.',
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
  prefixColumns = [],
  suffixColumns = [],
  renderFormFields,
  isSaveDisabled,
  onToggleActive,
  isToggleDisabled,
  toggleTitle,
  isEditDisabled,
  editTitle,
  isDeleteDisabled,
  deleteTitle,
  renderNameMeta,
  renderMobileExtra,
  renderBanners,
  renderFilters,
  placeholder,
  renderPattern,
}: RuleEditorProps<TRule, TForm>) {
  // Dept filter — local state, pre-seeded from the sidebar switcher, evolves independently
  const { getSelectedDeptIds } = useDepartmentContextStore();
  const [localDeptFilter, setLocalDeptFilter] = useState<number[]>(() => getSelectedDeptIds());
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterPos, setFilterPos] = useState<{ top: number; left: number } | null>(null);

  const { data: allDepts = [] } = useDepartments();
  const user = useAuthStore((state) => state.user);
  const accessibleDepts =
    user?.role === 'admin'
      ? allDepts
      : allDepts.filter((dept) => (user?.departmentIds ?? []).includes(dept.id));

  const filteredRules =
    localDeptFilter.length === 0
      ? rules
      : rules.filter(
          (rule) =>
            rule.departmentId === null ||
            rule.departmentId === undefined ||
            localDeptFilter.includes(rule.departmentId)
        );

  const showPlaceholder = placeholder !== undefined && !loading && rules.length === 0;
  // Only show the dept filter when there are multiple accessible depts and we're past loading/placeholder
  const showDeptFilter = !loading && !showPlaceholder && accessibleDepts.length > 1;

  const openFilter = (ev: React.MouseEvent<HTMLButtonElement>) => {
    const rect = ev.currentTarget.getBoundingClientRect();
    const dropdownWidth = 208; // w-52
    const left = Math.min(rect.left, window.innerWidth - dropdownWidth - 8);
    setFilterPos({ top: rect.bottom + 4, left });
    setFilterOpen(true);
  };

  const clearFilter = () => {
    setLocalDeptFilter([]);
    setFilterOpen(false);
  };

  const toggleDept = (id: number) => {
    setLocalDeptFilter((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  const filterTriggerClasses = (active: boolean) =>
    `p-0.5 rounded transition-colors hover:bg-accent ${active ? 'text-primary' : 'text-muted-foreground'}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-start">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {!showPlaceholder && (
          <Button onClick={handleCreate} className="shrink-0 whitespace-nowrap">
            <Plus className="mr-2 w-4 h-4" />
            Add Rule
          </Button>
        )}
      </div>

      {/* Optional banners */}
      {renderBanners?.()}

      {/* Optional filter tabs — render once loaded so the user can still toggle
          filters when the current filter narrows results to zero. Previously
          this also gated on `rules.length > 0`, which trapped the user inside
          an empty Auto-learned tab with no way back. */}
      {!loading && renderFilters?.()}

      {/* Dept filter dropdown portal — rendered once, outside the responsive branches */}
      {filterOpen &&
        filterPos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setFilterOpen(false)} aria-hidden />
            <div
              className="fixed z-50 overflow-y-auto w-52 max-h-64 rounded-md border shadow-lg bg-card border-border"
              style={{ top: filterPos.top, left: filterPos.left }}
            >
              <div className="p-2">
                <p className="px-2 mb-1 text-[10px] font-semibold tracking-wide uppercase text-muted-foreground">
                  Filter by department
                </p>
                <button
                  type="button"
                  onClick={clearFilter}
                  className={`flex justify-between items-center px-3 py-2 w-full text-sm text-left rounded-md transition-colors hover:bg-accent ${localDeptFilter.length === 0 ? 'text-primary font-medium' : ''}`}
                >
                  <span>All departments</span>
                  {localDeptFilter.length === 0 && <X className="w-3.5 h-3.5 opacity-50" />}
                </button>
                {accessibleDepts.map((dept) => {
                  const checked = localDeptFilter.includes(dept.id);
                  return (
                    <button
                      key={dept.id}
                      type="button"
                      onClick={() => toggleDept(dept.id)}
                      className="flex justify-between items-center px-3 py-2 w-full text-sm text-left rounded-md transition-colors hover:bg-accent"
                    >
                      <span className={checked ? 'font-medium' : ''}>{dept.name}</span>
                      <span
                        className={`flex-shrink-0 w-4 h-4 rounded border transition-colors ${checked ? 'bg-primary border-primary' : 'border-border'}`}
                      >
                        {checked && (
                          <svg
                            viewBox="0 0 16 16"
                            fill="none"
                            className="w-full h-full text-primary-foreground"
                          >
                            <path
                              d="M3 8l3.5 3.5L13 4.5"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </span>
                    </button>
                  );
                })}
                {localDeptFilter.length > 0 && (
                  <div className="border-t mt-1 pt-1">
                    <button
                      type="button"
                      onClick={clearFilter}
                      className="px-3 py-1.5 w-full text-xs text-left rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    >
                      Clear filter (show all)
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>,
          document.body
        )}

      {/* Table / empty / loading / placeholder */}
      {loading ? (
        <div className="py-12 text-center text-muted-foreground">Loading rules...</div>
      ) : showPlaceholder ? (
        <div className="py-12 text-center text-muted-foreground">{placeholder}</div>
      ) : filteredRules.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          {localDeptFilter.length > 0 ? (
            <p>
              No rules match the selected department filter.{' '}
              <button
                type="button"
                onClick={() => setLocalDeptFilter([])}
                className="underline hover:no-underline"
              >
                Clear filter
              </button>
            </p>
          ) : (
            emptyMessage
          )}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block overflow-x-auto rounded-lg border">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/50">
                <tr>
                  <th className={`${thClass} text-left`}>
                    <div className="flex gap-1 items-center">
                      <span>Name</span>
                      {showDeptFilter && (
                        <div className="relative inline-flex">
                          <button
                            type="button"
                            onClick={openFilter}
                            className={filterTriggerClasses(localDeptFilter.length > 0)}
                            title="Filter by department"
                          >
                            <Filter className="w-3 h-3" />
                          </button>
                          {localDeptFilter.length > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 text-[9px] flex items-center justify-center rounded-full bg-primary text-primary-foreground font-bold pointer-events-none">
                              {localDeptFilter.length}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </th>
                  {prefixColumns.map((col) => (
                    <th key={col.header} className={`${thClass} ${alignClass(col.align)}`}>
                      {col.header}
                    </th>
                  ))}
                  <th className={`${thClass} text-left`}>Description</th>
                  <th className={`${thClass} text-left`}>Pattern</th>
                  {suffixColumns.map((col) => (
                    <th key={col.header} className={`${thClass} ${alignClass(col.align)}`}>
                      {col.header}
                    </th>
                  ))}
                  <th className={`${thClass} text-center`}>Status</th>
                  <th className={`${thClass} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y bg-background divide-border">
                {filteredRules.map((rule) => {
                  const toggleDisabled = isToggleDisabled?.(rule) ?? false;
                  const editDisabled = isEditDisabled?.(rule) ?? false;
                  const deleteDisabled = isDeleteDisabled?.(rule) ?? false;
                  return (
                    <tr key={rule.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-sm font-medium">{rule.name}</p>
                        {renderNameMeta && (
                          <div className="flex flex-wrap gap-1 mt-0.5">{renderNameMeta(rule)}</div>
                        )}
                      </td>
                      {prefixColumns.map((col) => (
                        <td
                          key={col.header}
                          className={`px-4 py-3 text-sm whitespace-nowrap ${alignClass(col.align)}`}
                        >
                          {col.render(rule)}
                        </td>
                      ))}
                      <td className="px-4 py-3 max-w-xs text-sm truncate text-muted-foreground">
                        {rule.description}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {rule.pattern ? (
                          <code className="block max-w-[180px] truncate px-2 py-0.5 font-mono text-xs rounded bg-muted">
                            {renderPattern ? renderPattern(rule.pattern) : rule.pattern}
                          </code>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      {suffixColumns.map((col) => (
                        <td
                          key={col.header}
                          className={`px-4 py-3 text-sm ${alignClass(col.align)}`}
                        >
                          {col.render(rule)}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-sm text-center">
                        <button
                          onClick={() => !toggleDisabled && onToggleActive(rule)}
                          disabled={toggleDisabled}
                          title={toggleTitle?.(rule)}
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
                      </td>
                      <td className="px-4 py-3 text-sm text-right whitespace-nowrap">
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(rule)}
                            disabled={editDisabled}
                            title={editTitle?.(rule)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteClick(rule)}
                            disabled={deleteDisabled}
                            title={deleteTitle?.(rule)}
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
            {showDeptFilter && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={openFilter}
                  className={`flex gap-1 items-center px-2 py-1 text-xs rounded border transition-colors ${
                    localDeptFilter.length > 0
                      ? 'border-primary text-primary bg-primary/10'
                      : 'border-border text-muted-foreground hover:bg-accent'
                  }`}
                >
                  <Filter className="w-3 h-3" />
                  <span>
                    {localDeptFilter.length === 0
                      ? 'All depts'
                      : `${localDeptFilter.length} dept${localDeptFilter.length === 1 ? '' : 's'}`}
                  </span>
                </button>
              </div>
            )}
            {filteredRules.map((rule) => {
              const editDisabled = isEditDisabled?.(rule) ?? false;
              const deleteDisabled = isDeleteDisabled?.(rule) ?? false;
              const toggleDisabled = isToggleDisabled?.(rule) ?? false;
              return (
                <div key={rule.id} className="p-4 rounded-lg border bg-card space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{rule.name}</p>
                      {renderNameMeta && (
                        <div className="flex flex-wrap gap-1 mt-1">{renderNameMeta(rule)}</div>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(rule)}
                        disabled={editDisabled}
                        title={editTitle?.(rule)}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(rule)}
                        disabled={deleteDisabled}
                        title={deleteTitle?.(rule)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950 disabled:text-muted-foreground"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{rule.description}</p>
                  {rule.pattern && (
                    <code className="block px-2 py-1 font-mono text-xs rounded bg-muted break-all">
                      {renderPattern ? renderPattern(rule.pattern) : rule.pattern}
                    </code>
                  )}
                  <div className="flex flex-wrap gap-2 items-center justify-between">
                    {renderMobileExtra ? (
                      <div className="flex flex-wrap gap-1 items-center">
                        {renderMobileExtra(rule)}
                      </div>
                    ) : (
                      <div />
                    )}
                    <button
                      onClick={() => !toggleDisabled && onToggleActive(rule)}
                      disabled={toggleDisabled}
                      title={toggleTitle?.(rule)}
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

      {/* Edit / Create dialog */}
      <Dialog open={isCreating || editingRule !== null} onOpenChange={handleCancel}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {isCreating ? 'Create' : 'Edit'} {dialogTitle}
            </DialogTitle>
            <DialogClose onClose={handleCancel} />
          </DialogHeader>
          <div className="space-y-4">{renderFormFields(formData, setFormData)}</div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              <X className="mr-1 w-4 h-4" />
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaveDisabled?.(formData) ?? false}
              className="gap-1"
            >
              <Save className="w-4 h-4" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={handleDeleteCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {dialogTitle}</DialogTitle>
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
}
