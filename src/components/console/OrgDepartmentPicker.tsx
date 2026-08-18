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
 */
export const OrgDepartmentPicker = ({
  allianceId,
  orgId,
  orgLabel,
  selected,
  onChange,
  disabled,
}: OrgDepartmentPickerProps) => {
  const query = useOrgDepartments(allianceId, orgId);
  const departments = query.data ?? [];

  const toggle = (deptId: number, checked: boolean) => {
    onChange(checked ? [...selected, deptId] : selected.filter((id) => id !== deptId));
  };

  return (
    <div className="pl-3 space-y-1 border-l-2 border-muted">
      <p className="text-xs font-medium text-muted-foreground">{orgLabel} — departments</p>
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
  );
};
