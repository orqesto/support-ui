import { useId, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { useOrgDepartments } from '@/hooks/useAllianceGroups';

type OrgDepartmentPickerProps = {
  allianceId: number | null;
  orgId: number;
  /** Human label for the workspace this picker belongs to. */
  orgLabel: string;
  /** Currently-mapped department ids for this org. */
  selected: number[];
  onChange: (deptIds: number[]) => void;
  disabled?: boolean;
};

/**
 * Per-workspace department picker: lists ONE org's mappable departments (from the
 * alliance dept read endpoint) as toggles, so an alliance admin can scope a group's
 * grant to specific departments in that workspace. Ids are org-specific — the BE
 * clamps anything foreign, but the picker only ever offers this org's own depts.
 *
 * Shared by GroupEditor (authoring) and SyncedGroupsCard (inline IdP-group wiring).
 * Departments are org-scoped, so one instance is rendered per selected workspace.
 *
 * 🔑 Collapsed by default, matching PermissionOverridesSection's "Customize
 * permissions". Scoping to departments is the exception, not the common case — the
 * usual answer is "leave it empty for the role default" — so a row of toggles opened
 * on every workspace made the far more common decision (which role, which workspace)
 * compete with it. The count badge is what keeps that honest: a group that IS scoped
 * says so without being expanded, so collapsing hides the control, never the state.
 */
export const OrgDepartmentPicker = ({
  allianceId,
  orgId,
  orgLabel,
  selected,
  onChange,
  disabled,
}: OrgDepartmentPickerProps) => {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const query = useOrgDepartments(allianceId, orgId);
  const departments = query.data ?? [];

  const toggle = (deptId: number, checked: boolean) => {
    onChange(checked ? [...selected, deptId] : selected.filter((id) => id !== deptId));
  };

  return (
    <div className="pl-3 space-y-1 border-l-2 border-muted">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls={panelId}
        className="gap-1 items-center p-0 h-auto text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-primary"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        {orgLabel} — departments
        {selected.length > 0 && (
          <span className="ml-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-primary/10 text-primary">
            {selected.length}
          </span>
        )}
      </Button>
      {open && (
        <div id={panelId}>
          {query.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading departments…</p>
          ) : departments.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No departments in this workspace — members get the role default.
            </p>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {departments.map((dept) => (
                <Toggle
                  key={dept.id}
                  label={dept.name}
                  checked={selected.includes(dept.id)}
                  disabled={disabled}
                  onChange={(checked) => toggle(dept.id, checked)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
