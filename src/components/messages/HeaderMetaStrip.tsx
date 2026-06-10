import { safeCssColor } from '@/lib/utils';
import { useRef, useState, useEffect } from 'react';
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
  onDepartmentChange,
}: Props) {
  const labelPickerRef = useRef<HTMLDivElement>(null);
  const labelBtnRef = useRef<HTMLButtonElement>(null);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);
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

  const handleDeptChange = async (value: string) => {
    const nextId = Number(value);
    if (!Number.isFinite(nextId) || nextId === message.departmentId) {
      setEditingDept(false);
      return;
    }
    setSavingDept(true);
    try {
      await messageService.manualRoute(message.id, nextId);
      onDepartmentChange?.();
    } catch (err) {
      logger.error('Failed to change department:', err);
    } finally {
      setSavingDept(false);
      setEditingDept(false);
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

  const threadItemId = message.subject
    ? `subj::${message.subject.replace(/^((re(\[\d+\])?|fwd|fw)\s*:\s*)*/gi, '').trim().toLowerCase()}::${message.sender}`
    : message.id;

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-2 px-4 pt-2 pb-3 border-t border-border/40">

      {/* Department (resolved by smart routing; admins can re-route inline) */}
      <div className="flex items-center gap-2 min-w-0">
        <span className={`flex-shrink-0 ${MONO} text-muted-foreground/70`}>Department</span>
        {editingDept && canRoute ? (
          <ReactSelect
            value={message.departmentId ? String(message.departmentId) : ''}
            onChange={(value) => void handleDeptChange(value)}
            options={activeDeptOptions}
            isDisabled={savingDept}
            autoFocus
            onBlur={() => setEditingDept(false)}
            className="min-w-[140px]"
          />
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
          type={message.subject ? 'thread' : 'message'}
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
                  <div
                    data-label-picker
                    style={{ top: pickerPos.top, left: pickerPos.left, width: 176 }}
                    className="absolute z-[9999] rounded-lg border border-border shadow-xl p-1 bg-card text-card-foreground"
                  >
                    {allLabels.map((label) => {
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
                  </div>,
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
