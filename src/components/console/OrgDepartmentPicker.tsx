import { useId, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
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

  // Ids this org does not list are kept as they are: the picker only offers this org's own
  // departments, and a tick here must not silently drop anything else from the mapping.
  const offered = new Set(departments.map((dept) => dept.id));
  const handleChange = (values: string[]) => {
    const ticked = values.map(Number);
    const kept = selected.filter((id) => !offered.has(id) || ticked.includes(id));
    onChange([...kept, ...ticked.filter((id) => !selected.includes(id))]);
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
            <Select
              multi
              aria-label={`${orgLabel} — departments`}
              placeholder="Role default (no departments)"
              options={departments.map((dept) => ({ value: String(dept.id), label: dept.name }))}
              value={selected.map(String)}
              onChange={handleChange}
              disabled={disabled}
            />
          )}
        </div>
      )}
    </div>
  );
};
