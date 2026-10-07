import { safeCssColor } from '@/lib/utils';
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Building2, X, Plus } from 'lucide-react';
import { AssignmentSelect } from '@/components/admin/AssignmentSelect';
import { WhyParked } from '@/components/messages/WhyParked';
import { Select } from '@/components/ui/Select';
import { labelPickerEmptyText, type LabelsStatus } from '@/components/shared/labelPickerText';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { useDepartmentById, useDepartments } from '@/hooks/useDepartments';
import { usePermissions } from '@/hooks/usePermissions';
import { messageService } from '@/services/message.service';
import { useAuthStore } from '@/stores/authStore';
import { Permission } from '@/types/roles';
import type { Message, Category } from '@/types';
import type { Label } from '@/services/settings.service';
import { logger } from '@/lib/logger';
import { LABEL } from './messageDetailConstants';
import { tintedChip } from '@/lib/userColor';

/** The label picker's drawn width — the ONE number its on-screen clamp also uses. */
const LABEL_PICKER_WIDTH_PX = 200;

type Props = {
  /**
   * 'rows' — stacked label/value rows for the full page's sidebar (v3); 'card' — the phone's
   * sender Details card (v4 mobile `.mrow`: 84px label, value on the right, a hairline between
   * rows, 40px tall); default inline row.
   */
  layout?: 'inline' | 'rows' | 'card';
  message: Message;
  categories: Category[];
  messageLabels: Label[];
  allLabels: Label[];
  /** Whether `allLabels` is fetched yet — the picker must not say "No labels yet" while loading. */
  labelsStatus?: LabelsStatus;
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
  layout = 'inline',
  message,
  categories,
  messageLabels,
  allLabels,
  labelsStatus = 'ready',
  hasManageLabels,
  showLabelPicker,
  updatingCategory,
  onAssign,
  onSetCategory,
  onToggleLabel,
  onToggleLabelPicker,
  onCloseLabelPicker,
  onCreateLabel,
  onDepartmentChange,
}: Props) {
  const rows = layout === 'rows';
  const card = layout === 'card';
  // The label column: 62px in the sidebar, 84px (pushing the value right) in the phone card.
  const labelWidth = rows ? 'w-[62px]' : card ? 'w-[84px] mr-auto' : '';
  const labelBtnRef = useRef<HTMLButtonElement>(null);
  // Only labels the picker lists can come back from it, so only they take part in the diff.
  const listedAssignedIds = messageLabels
    .filter((assigned) => allLabels.some((label) => label.id === assigned.id))
    .map((assigned) => String(assigned.id));
  // Inline create needs BOTH the permission and a handler — `hasManageLabels` alone
  // would render a picker whose only useful action is absent.
  const canCreateLabel = hasManageLabels && !!onCreateLabel;
  const showLabelRow = allLabels.length > 0 || messageLabels.length > 0 || canCreateLabel;
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
  // When on, routing (picking a department) ALSO mints a content→dept rule so
  // similar messages route automatically next time. Off by default. Shown next to
  // the dept picker while it's open — including for needs_routing conversations.
  const [createRule, setCreateRule] = useState(false);

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
    // real triage action — not a no-op — and must fire. An active-conv re-route to
    // its current dept is normally a no-op — UNLESS "Create rule" is on, in which
    // case picking the same dept is a deliberate "train a rule for this dept".
    const sameDeptNoop = !needsRouting && nextId === message.departmentId && !createRule;
    if (!Number.isFinite(nextId) || sameDeptNoop) {
      setEditingDept(false);
      return;
    }
    setSavingDept(true);
    try {
      // Pass the "Create rule" toggle through as `learn`: on → the BE also mints a
      // content→department rule; off → a one-off route with no training.
      await messageService.manualRoute(message.id, nextId, createRule);
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


  // Assign the conversation directly via the `conv_<id>` form — the same key the
  // message list and Kanban cards emit and that the backend fully supports.
  // The old `subj::<subject>::<sender>` key produced only 3 segments, but the
  // assignment API's subj:: parser expects the 4-segment participant form and
  // 500s on anything else (assignmentService.assignThreadToUser).
  const threadItemId = `conv_${message.id}`;

  return (
    // v3 meta row: Dept / Assigned / Category as compact values, labels inline — one wrapping
    // row instead of three large selects and a separate Labels line.
    <div
      data-testid={card ? 'meta-card-rows' : undefined}
      className={
        rows
          ? 'flex flex-col items-stretch gap-1.5 px-[13px] py-[11px] bg-raised border-b border-border [&>div]:gap-2'
          : card
            ? 'flex flex-col items-stretch pl-3 text-[13.5px] [&>div]:justify-end [&>div]:gap-3 [&>div]:min-h-10 [&>div]:py-1 [&>div]:pr-3 [&>div]:border-b [&>div]:border-hair [&>div:last-child]:border-b-0'
            : 'flex flex-wrap items-center gap-x-[9px] gap-y-1.5 px-3.5 pb-2.5'
      }
    >
      {/* Department (resolved by smart routing; admins can re-route inline) */}
      <div className="flex items-center gap-2 min-w-0">
        <span className={`flex-shrink-0 ${LABEL} text-muted-foreground ${labelWidth}`}>Dept</span>
        {editingDept && canRoute ? (
          <div className="flex items-center gap-2">
            <Select
              // needs_routing carries a placeholder departmentId; leave the picker
              // UNSET so choosing any dept (incl. the placeholder) is a real change
              // that fires onChange. Active convs keep their current dept selected.
              value={needsRouting ? '' : message.departmentId ? String(message.departmentId) : ''}
              onChange={(value) => void handleDeptChange(value)}
              options={activeDeptOptions}
              disabled={savingDept}
              size="sm"
              aria-label="Department"
              autoFocus
              onBlur={() => setEditingDept(false)}
              className="min-w-[140px]"
            />
            {/* "Create rule" toggle — appears with the dept picker (incl. needs_routing).
                When on, picking a department also mints a content→dept routing rule.
                onMouseDown preventDefault keeps the picker focused so toggling doesn't
                trip the select's onBlur and close the editor first. */}
            <span onMouseDown={(event) => event.preventDefault()}>
              <Toggle
                checked={createRule}
                onChange={setCreateRule}
                disabled={savingDept}
                label="Create rule"
              />
            </span>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            disabled={!canRoute}
            onClick={() => canRoute && setEditingDept(true)}
            title={
              canRoute
                ? 'Click to change department'
                : 'You need ticket management permission to re-route'
            }
            // A v3 value like Assigned/Category beside it; the department's own colour stays
            // on the icon. Needs routing keeps its state tone — it is a condition, not a value.
            // v3 `.val`: one line, never wraps. It must not SHRINK either: the why-parked text beside
            // it would squeeze it to its icon. max-w-full still ellipsizes a very long name.
            className={`inline-flex flex-shrink-0 gap-1 items-center ${card ? 'h-9 text-[13.5px]' : 'h-[23px] text-[11.5px]'} max-w-full px-2 rounded-md border font-normal whitespace-nowrap overflow-hidden ${
              canRoute ? 'cursor-pointer hover:border-border-strong' : 'cursor-default'
            } ${needsRouting ? 'bg-warning-muted text-warning border-warning-line' : 'bg-card text-foreground border-border'}`}
          >
            {needsRouting ? (
              <>
                <AlertTriangle className="flex-shrink-0 w-3 h-3" />
                <span className="truncate">Needs routing</span>
              </>
            ) : primaryDept ? (
              <>
                <Building2
                  className="flex-shrink-0 w-3 h-3"
                  style={primaryDept.color ? { color: safeCssColor(primaryDept.color) } : undefined}
                />
                <span className="truncate">{primaryDept.name}</span>
              </>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </Button>
        )}
        {needsRouting && <WhyParked conversationId={message.id} />}
      </div>

      {/* Assignee */}
      <div className="flex items-center gap-2 min-w-0">
        <span className={`flex-shrink-0 ${LABEL} text-muted-foreground ${labelWidth}`}>
          Assigned
        </span>
        <AssignmentSelect
          type="thread"
          itemId={threadItemId}
          currentAssigneeId={message.assigneeId}
          departmentId={message.departmentId ?? null}
          onAssign={onAssign}
          variant="value"
          mobileSheet={card}
        />
      </div>

      {/* Category */}
      {categories.length > 0 && (
        <>
          <div className="flex items-center gap-2 min-w-0">
            <span className={`flex-shrink-0 ${LABEL} text-muted-foreground ${labelWidth}`}>
              Category
            </span>
            <Select
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
              disabled={updatingCategory}
              aria-label="Category"
              variant="value"
              className="min-w-0"
              mobileSheet={card}
            />
          </div>
        </>
      )}

      {/* Labels — shown when there is something to SEE or something to DO. Gating this
          on `allLabels.length > 0` alone hid the only inline path to the FIRST label:
          the "Create …" affordance lives inside the picker, behind the button below, so
          a workspace with no labels could never create one from a message. */}
      {showLabelRow && (
        <>
          <div className="flex items-center gap-[5px] min-w-0 flex-wrap">
            {(rows || card) && (
              <span className={`flex-shrink-0 ${LABEL} text-muted-foreground ${labelWidth}`}>
                Labels
              </span>
            )}
            {messageLabels.map((label) => (
              // v4 `.tagpill[data-t]`: a tint of the label colour with a 7px dot, not a solid fill.
              <span
                key={label.id}
                data-testid="label-pill"
                className={`inline-flex items-center gap-[5px] h-[22px] pl-[7px] ${hasManageLabels ? 'pr-1' : 'pr-2'} rounded-full border text-[11.5px] font-medium whitespace-nowrap ${tintedChip(label.color, 0.12).className}`}
                style={tintedChip(label.color, 0.12).style}
              >
                <span
                  aria-hidden
                  className="w-[7px] h-[7px] rounded-full flex-none"
                  style={{ background: safeCssColor(label.color) }}
                />
                {label.name}
                {hasManageLabels && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onToggleLabel(label)}
                    className="flex items-center justify-center w-3.5 h-3.5 p-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-transparent transition-colors"
                    aria-label={`Remove ${label.name}`}
                  >
                    <X className="w-2 h-2" />
                  </Button>
                )}
              </span>
            ))}

            {hasManageLabels && (
              <Select
                variant="popover"
                multi
                aria-label="Labels"
                // Open state stays with the parent: it drives the phone scrim, Esc and close-after-create.
                open={showLabelPicker}
                onOpenChange={(next) => {
                  if (!next) onCloseLabelPicker();
                  else if (!showLabelPicker) onToggleLabelPicker();
                }}
                popoverWidth={LABEL_PICKER_WIDTH_PX}
                panelProps={{ 'data-label-picker': true }}
                options={allLabels.map((label) => ({
                  value: String(label.id),
                  label: label.name,
                  color: label.color,
                }))}
                value={listedAssignedIds}
                onChange={(next) => {
                  // One tick or untick per change: hand that one label to the parent's toggle.
                  const changed =
                    next.find((id) => !listedAssignedIds.includes(id)) ??
                    listedAssignedIds.find((id) => !next.includes(id));
                  const label = allLabels.find((candidate) => String(candidate.id) === changed);
                  if (label) onToggleLabel(label);
                }}
                creatable={!!onCreateLabel}
                onCreate={(name) => void onCreateLabel?.(name)}
                placeholder={onCreateLabel ? 'Search or create…' : 'Search…'}
                noOptionsMessage={() =>
                  labelPickerEmptyText(labelsStatus, allLabels.length, !!onCreateLabel)
                }
                trigger={({ toggle }) => (
                  <Button
                    ref={labelBtnRef}
                    variant="ghost"
                    onClick={toggle}
                    className={`inline-flex flex-shrink-0 justify-center items-center py-0 px-2 ${card ? 'h-[30px] w-[30px]' : 'h-5'} rounded-full text-muted-foreground hover:text-foreground hover:bg-accent border border-dashed border-border-strong transition-colors`}
                    aria-label="Add label"
                    title="Add label"
                  >
                    <Plus className="w-2.5 h-2.5" />
                  </Button>
                )}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
