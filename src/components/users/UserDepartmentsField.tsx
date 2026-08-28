import { Lock } from 'lucide-react';
import type { Department } from '@/services/department.service';
import { departmentUnservedLabel, isDepartmentServed } from '@/utils/departmentReachability';

type UserDepartmentsFieldProps = {
  departments: Department[];
  selectedIds: number[];
  onChange: (next: number[]) => void;
  /** Ask before dropping the catch-all department — losing it silently hides Info mail. */
  onConfirmRemoveCatchAll: (departmentId: number) => void;
  /**
   * Departments the IDENTITY PROVIDER granted. Locked individually rather than locking the
   * whole field: the workspace admin owns the 'manual' layer and can always ADD, but cannot
   * revoke a directory grant — the reconcile would simply put it back. Showing these as
   * ordinary unticked-able checkboxes is what produces the "I removed it and it came back"
   * report. Defaults to `[]` against a backend that does not send the field yet.
   */
  provisionedIds?: number[];
  /** Global admins reach every department; the checklist would be misleading. */
  isGlobalAdmin: boolean;
};

export const UserDepartmentsField = ({
  departments,
  selectedIds,
  onChange,
  onConfirmRemoveCatchAll,
  provisionedIds = [],
  isGlobalAdmin,
}: UserDepartmentsFieldProps) => {
  const fromDirectory = (departmentId: number) => provisionedIds.includes(departmentId);
  const hasDirectoryGrants = departments.some((dept) => fromDirectory(dept.id));
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
            const directoryLocked = fromDirectory(dept.id);
            const disabled = directoryLocked || sourceDisabled;
            return (
              <label
                key={dept.id}
                className={`flex gap-2 items-center ${disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                title={
                  directoryLocked
                    ? 'Granted by your identity provider. Remove it from the IdP group to take it away.'
                    : undefined
                }
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={disabled}
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
                {directoryLocked && (
                  <span className="inline-flex gap-1 items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-muted text-muted-foreground">
                    <Lock className="w-2.5 h-2.5" />
                    from directory
                  </span>
                )}
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
      <p className="flex gap-1 items-center mt-1 text-xs text-muted-foreground">
        {hasDirectoryGrants && <Lock className="w-3 h-3 shrink-0" />}
        {hasDirectoryGrants
          ? 'You can add departments here; the ones marked “from directory” come from your identity provider and have to be changed there.'
          : 'User can access tickets and messages from selected departments'}
      </p>
    </div>
  );
};
