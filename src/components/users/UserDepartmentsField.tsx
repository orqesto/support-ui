import { Lock } from 'lucide-react';
import type { Department } from '@/services/department.service';
import { departmentUnservedLabel, isDepartmentServed } from '@/utils/departmentReachability';

type UserDepartmentsFieldProps = {
  departments: Department[];
  selectedIds: number[];
  onChange: (next: number[]) => void;
  /** Ask before dropping the catch-all department — losing it silently hides Info mail. */
  onConfirmRemoveCatchAll: (departmentId: number) => void;
  /** IdP owns department membership for this member (D2-01a). */
  readOnly: boolean;
  /** Global admins reach every department; the checklist would be misleading. */
  isGlobalAdmin: boolean;
};

export const UserDepartmentsField = ({
  departments,
  selectedIds,
  onChange,
  onConfirmRemoveCatchAll,
  readOnly,
  isGlobalAdmin,
}: UserDepartmentsFieldProps) => {
  if (isGlobalAdmin) {
    return (
      <div>
        <div className="block mb-2 text-sm font-medium">Departments</div>
        <p className="-mt-1 text-xs text-muted-foreground">
          Global admins have access to all departments
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="block mb-2 text-sm font-medium">Departments</div>
      <div className="p-4 space-y-2 rounded-md border border-border bg-muted/30">
        {departments
          .filter((dept) => isDepartmentServed(dept) || selectedIds.includes(dept.id))
          .map((dept) => {
            // Catch-all dept slug was renamed 'general' → 'info'; accept both for mixed envs.
            const isGeneral = dept.slug === 'info' || dept.slug === 'general';
            const isChecked = selectedIds.includes(dept.id);
            const unservedLabel = departmentUnservedLabel(dept);
            // Block ADDING an unserved dept, but still allow UNCHECKING one the user is
            // already in, so an admin can clean up a stale assignment.
            const sourceDisabled = !isDepartmentServed(dept) && !isChecked;
            return (
              <label
                key={dept.id}
                className={`flex gap-2 items-center ${readOnly || sourceDisabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={readOnly || sourceDisabled}
                  onChange={(event) => {
                    if (event.target.checked) {
                      onChange([...selectedIds, dept.id]);
                      return;
                    }
                    // Never leave a member with zero departments.
                    if (selectedIds.length <= 1) return;
                    if (isGeneral) {
                      onConfirmRemoveCatchAll(dept.id);
                      return;
                    }
                    onChange(selectedIds.filter((deptId) => deptId !== dept.id));
                  }}
                  className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <span className="text-sm">{dept.name}</span>
                {isGeneral && (
                  <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-muted text-muted-foreground">
                    catch-all
                  </span>
                )}
                {unservedLabel && (
                  <span className="ml-auto text-xs text-muted-foreground">— {unservedLabel}</span>
                )}
              </label>
            );
          })}
      </div>
      <p
        className={`flex gap-1 items-center mt-1 text-xs ${readOnly ? 'font-medium text-amber-600' : 'text-muted-foreground'}`}
      >
        {readOnly && <Lock className="w-3 h-3" />}
        {readOnly
          ? 'Managed by IdP (SCIM) — departments are set by your identity provider group mappings.'
          : 'User can access tickets and messages from selected departments'}
      </p>
    </div>
  );
};
