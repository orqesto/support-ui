import { safeCssColor } from '@/lib/utils';
import { useRef, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { AlertTriangle, Building2, Check, X, Tag, Plus } from 'lucide-react';
import { AssignmentSelect } from '@/components/admin/AssignmentSelect';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { useDepartmentById, useDepartments } from '@/hooks/useDepartments';
import { usePermissions } from '@/hooks/usePermissions';
import { messageService } from '@/services/message.service';
import { useAuthStore } from '@/stores/authStore';
import { Permission } from '@/types/roles';
import type { Message, Category } from '@/types';
import type { Label } from '@/services/settings.service';
import { logger } from '@/lib/logger';
import { MONO } from './messageDetailConstants';

type Props = {
  message: Message;
  categories: Category[];
  messageLabels: Label[];
  allLabels: Label[];
  hasManageLabels: boolean;
  showLabelPicker: boolean;
  updatingCategory: boolean;
  onAssign?: () => void;
  onSetCategory: (categoryId: number | null) => void;
  onToggleLabel: (label: Label) => void;
  onToggleLabelPicker: () => void;
  onCloseLabelPicker: () => void;
  /** Optional inline-create handler. When omitted, the "Create" affordance is
   * hidden (e.g. for users without manage-label permission). Parent owns the
   * service call so it can also update allLabels + close the picker. */
  onCreateLabel?: (name: string) => void | Promise<void>;
  /** Refetch trigger so the parent picks up the new departmentId after re-routing. */
  onDepartmentChange?: () => void;
};

export function HeaderMetaStrip({
  message,
  categories,
  messageLabels,
  allLabels,
  hasManageLabels,
  showLabelPicker,
  updatingCategory,
  onAssign,
  onSetCategory,
  onToggleLabel,
  onToggleLabelPicker,
  onCloseLabelPicker: _onCloseLabelPicker,
  onCreateLabel,
  onDepartmentChange,
}: Props) {
  const labelPickerRef = useRef<HTMLDivElement>(null);
  const labelBtnRef = useRef<HTMLButtonElement>(null);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);
  const [labelQuery, setLabelQuery] = useState('');
  // Reset the search input each time the picker opens so it starts fresh.
  useEffect(() => {
    if (!showLabelPicker) setLabelQuery('');
  }, [showLabelPicker]);
  const primaryDept = useDepartmentById(message.departmentId ?? null);
  const needsRouting = message.status === 'needs_routing';
  const { data: allDepts = [] } = useDepartments();
  const { hasPermission, isOrgAdmin } = usePermissions();
  const currentUser = useAuthStore((state) => state.user);
  // MANAGE_MESSAGES is the matching gate on the BE manualRouteMessage endpoint —
  // re-routing a conversation is a message operation, not a ticket operation.
  const canRoute = hasPermission(Permission.MANAGE_MESSAGES);
  const [editingDept, setEditingDept] = useState(false);
  const [savingDept, setSavingDept] = useState(false);
  // "Create rule" is a distinct action from routing: routing (dropdown) moves the conv
  // WITHOUT training; this explicitly mints a rule for the conv's CURRENT department. Kept
  // separate because react-select won't re-fire onChange for the already-selected dept, so
  // a toggle-then-reselect flow can't work — an explicit button always can.
  const [creatingRule, setCreatingRule] = useState(false);
  const [ruleCreated, setRuleCreated] = useState(false);
  // Clear the "rule created" confirmation when the editor is reopened.
  useEffect(() => {
    if (!editingDept) setRuleCreated(false);
  }, [editingDept]);

  // Only offer depts the user can actually route to. The BE bypass-list mirrors
  // here so the picker matches what'd actually be accepted:
  //   - global admins → all depts (BE bypass)
  //   - org_admins   → all depts (BE bypass; org_admin has org-wide authority)
  //   - everyone else → only depts they're a member of
  const isGlobalAdmin = currentUser?.role === 'admin';
  const canRouteAnyDept = isGlobalAdmin || isOrgAdmin;
  const userDeptIds = new Set(currentUser?.departmentIds ?? []);
  const activeDeptOptions = allDepts
    .filter((dept) => dept.active && (canRouteAnyDept || userDeptIds.has(dept.id)))
    .map((dept) => ({ value: String(dept.id), label: dept.name }));

  const queryClient = useQueryClient();

  const handleDeptChange = async (value: string) => {
    const nextId = Number(value);
    // For a needs_routing message the departmentId is just the first-active
    // PLACEHOLDER (the column is NOT NULL), so routing it to that same dept is a
    // real triage action — not a no-op — and must fire. Only an active-conv
    // re-route to its current dept is a genuine no-op worth skipping.
    if (!Number.isFinite(nextId) || (!needsRouting && nextId === message.departmentId)) {
      setEditingDept(false);
      return;
    }
    setSavingDept(true);
    try {
      // Routing alone never trains the router (learn defaults to false).
      await messageService.manualRoute(message.id, nextId);
      // Routing a needs_routing message removes it from the queue — refresh the
      // sidebar badge immediately instead of waiting for the 60s poll.
      void queryClient.invalidateQueries({ queryKey: ['needs-routing-count'] });
      onDepartmentChange?.();
    } catch (err) {
      logger.error('Failed to change department:', err);
    } finally {
      setSavingDept(false);
      setEditingDept(false);
    }
  };

  // Explicitly create a routing rule for the conv's CURRENT department (learn=true).
  // Handles the "I routed but forgot to create a rule" recovery: same-dept route → the BE
  // mints a content→dept rule. No dept change happens.
  const handleCreateRule = async () => {
    if (typeof message.departmentId !== 'number') return;
    setCreatingRule(true);
    try {
      await messageService.manualRoute(message.id, message.departmentId, true);
      setRuleCreated(true);
      onDepartmentChange?.();
    } catch (err) {
      logger.error('Failed to create routing rule:', err);
    } finally {
      setCreatingRule(false);
    }
  };

  useEffect(() => {
    if (showLabelPicker && labelBtnRef.current) {
      const rect = labelBtnRef.current.getBoundingClientRect();
      const pickerWidth = 176;
      const left = Math.min(rect.left, window.innerWidth - pickerWidth - 8);
      const top = rect.bottom + window.scrollY + 6;
      setPickerPos({ top, left });
    }
  }, [showLabelPicker]);

  // Assign the conversation directly via the `conv_<id>` form — the same key the
  // message list and Kanban cards emit and that the backend fully supports.
  // The old `subj::<subject>::<sender>` key produced only 3 segments, but the
  // assignment API's subj:: parser expects the 4-segment participant form and
  // 500s on anything else (assignmentService.assignThreadToUser).
  const threadItemId = `conv_${message.id}`;

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-2 px-4 pt-2 pb-3 border-t border-border/40">

      {/* Department (resolved by smart routing; admins can re-route inline) */}
      <div className="flex items-center gap-2 min-w-0">
        <span className={`flex-shrink-0 ${MONO} text-muted-foreground/70`}>Department</span>
        {editingDept && canRoute ? (
          <div className="flex items-center gap-2">
            <ReactSelect
              // needs_routing carries a placeholder departmentId; leave the picker
              // UNSET so choosing any dept (incl. the placeholder) is a real change
              // that fires onChange. Active convs keep their current dept selected.
              value={needsRouting ? '' : message.departmentId ? String(message.departmentId) : ''}
              onChange={(value) => void handleDeptChange(value)}
              options={activeDeptOptions}
              isDisabled={savingDept}
              autoFocus
              onBlur={() => setEditingDept(false)}
              className="min-w-[140px]"
            />
            {/* Create a routing rule for the CURRENT department (distinct from routing).
                Only for already-routed convs — a needs_routing conv has a placeholder dept.
                onMouseDown preventDefault keeps the picker focused so the click doesn't
                trip the select's onBlur and close the editor first. */}
            {!needsRouting && typeof message.departmentId === 'number' && (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void handleCreateRule()}
                disabled={creatingRule || ruleCreated}
                title={`Create a routing rule so similar messages route to ${primaryDept?.name ?? 'this department'} automatically`}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground disabled:opacity-60 whitespace-nowrap"
              >
                {ruleCreated ? '✓ Rule created' : creatingRule ? 'Creating…' : 'Create rule'}
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            disabled={!canRoute}
            onClick={() => canRoute && setEditingDept(true)}
            title={
              canRoute
                ? 'Click to change department'
                : 'You need ticket management permission to re-route'
            }
            className={`inline-flex gap-1 items-center px-1.5 py-0.5 text-[11px] font-medium rounded ${
              canRoute ? 'cursor-pointer hover:ring-1 hover:ring-border' : 'cursor-default'
            } ${
              needsRouting
                ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200'
                : ''
            }`}
            style={
              !needsRouting && primaryDept
                ? {
                    backgroundColor: primaryDept.color
                      ? `${safeCssColor(primaryDept.color)}22`
                      : undefined,
                    color: primaryDept.color ? safeCssColor(primaryDept.color) : undefined,
                  }
                : undefined
            }
          >
            {needsRouting ? (
              <>
                <AlertTriangle className="w-3 h-3" />
                Needs routing
              </>
            ) : primaryDept ? (
              <>
                <Building2 className="w-3 h-3" />
                {primaryDept.name}
              </>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </button>
        )}
      </div>

      <span className="text-border/60 select-none px-1">·</span>

      {/* Assignee */}
      <div className="flex items-center gap-2 min-w-0">
        <span className={`flex-shrink-0 ${MONO} text-muted-foreground/70`}>Assigned</span>
        <AssignmentSelect
          type="thread"
          itemId={threadItemId}
          currentAssigneeId={message.assigneeId}
          departmentId={message.departmentId ?? null}
          onAssign={onAssign}
        />
      </div>

      {/* Category */}
      {categories.length > 0 && (
        <>
          <span className="text-border/60 select-none px-1">·</span>
          <div className="flex items-center gap-2 min-w-0">
            <span className={`flex-shrink-0 ${MONO} text-muted-foreground/70`}>Category</span>
            <ReactSelect
              value={
                message.categoryId !== null && message.categoryId !== undefined
                  ? String(message.categoryId)
                  : ''
              }
              onChange={(val) => onSetCategory(val ? Number(val) : null)}
              options={[
                { value: '', label: 'No category' },
                ...categories.map((cat) => ({ value: String(cat.id), label: cat.name })),
              ]}
              isDisabled={updatingCategory}
              className="min-w-0"
            />
          </div>
        </>
      )}

      {/* Labels */}
      {allLabels.length > 0 && (
        <>
          <span className="text-border/60 select-none px-1">·</span>
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <span className={`flex-shrink-0 ${MONO} text-muted-foreground/70`}>Labels</span>

            {messageLabels.map((label) => (
              <span
                key={label.id}
                className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[10px] font-semibold text-white shadow-sm whitespace-nowrap"
                style={{ backgroundColor: safeCssColor(label.color) }}
              >
                {label.name}
                {hasManageLabels && (
                  <button
                    onClick={() => onToggleLabel(label)}
                    className="flex items-center justify-center w-3.5 h-3.5 rounded-full hover:bg-black/20 transition-colors"
                    aria-label={`Remove ${label.name}`}
                  >
                    <X className="w-2 h-2" />
                  </button>
                )}
              </span>
            ))}

            {hasManageLabels && (
              <div ref={labelPickerRef}>
                <button
                  ref={labelBtnRef}
                  onClick={onToggleLabelPicker}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent border border-dashed border-border/70 transition-colors"
                  aria-label="Add label"
                >
                  <Tag className="w-2.5 h-2.5" />
                  <Plus className="w-2.5 h-2.5" />
                </button>

                {showLabelPicker && pickerPos && createPortal(
                  (() => {
                    const trimmed = labelQuery.trim();
                    const lower = trimmed.toLowerCase();
                    const filtered = trimmed
                      ? allLabels.filter((label) => label.name.toLowerCase().includes(lower))
                      : allLabels;
                    const exact = trimmed && allLabels.some(
                      (label) => label.name.toLowerCase() === lower
                    );
                    const showCreate = !!onCreateLabel && trimmed.length > 0 && !exact;
                    return (
                      <div
                        data-label-picker
                        style={{ top: pickerPos.top, left: pickerPos.left, width: 200 }}
                        className="absolute z-[9999] rounded-lg border border-border shadow-xl p-1 bg-card text-card-foreground"
                      >
                        <input
                          type="text"
                          value={labelQuery}
                          onChange={(ev) => setLabelQuery(ev.target.value)}
                          placeholder={onCreateLabel ? 'Search or create…' : 'Search…'}
                          autoFocus
                          className="w-full px-2 py-1 mb-1 text-xs bg-background border border-border rounded outline-none focus:ring-1 focus:ring-ring"
                        />
                        {filtered.map((label) => {
                          const assigned = messageLabels.some((lbl) => lbl.id === label.id);
                          return (
                            <button
                              key={label.id}
                              onClick={() => onToggleLabel(label)}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-accent transition-colors text-left"
                            >
                              <span
                                className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-1 ring-border"
                                style={{ backgroundColor: safeCssColor(label.color) }}
                              />
                              <span className="flex-1 text-foreground">{label.name}</span>
                              {assigned && <Check className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                            </button>
                          );
                        })}
                        {showCreate && (
                          <button
                            onClick={() => void onCreateLabel?.(trimmed)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 mt-1 rounded-md text-xs hover:bg-accent transition-colors text-left border-t border-border"
                          >
                            <Plus className="w-2.5 h-2.5 text-muted-foreground flex-shrink-0" />
                            <span className="flex-1 text-foreground">
                              Create &quot;{trimmed}&quot;
                            </span>
                          </button>
                        )}
                        {filtered.length === 0 && !showCreate && (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">
                            No labels match.
                          </div>
                        )}
                      </div>
                    );
                  })(),
                  document.body
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
