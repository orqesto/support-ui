import { useState, useEffect, useCallback } from 'react';
import { Layers, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/authStore';
import { useDepartmentContextStore } from '@/stores/departmentContextStore';
import { useDepartments } from '@/hooks/useDepartments';

export const DepartmentSwitcher = () => {
  const user = useAuthStore((state) => state.user);
  const selectedOrganizationId = useAuthStore((state) => state.selectedOrganizationId);

  const { data: allDepts = [], isLoading } = useDepartments();
  const { getSelectedDeptIds, setSelected, clear } = useDepartmentContextStore();

  const [isOpen, setIsOpen] = useState(false);

  // User's accessible dept IDs (from auth store); global admins see all
  const accessibleDeptIds: number[] =
    user?.role === 'admin' ? allDepts.map((dept) => dept.id) : (user?.departmentIds ?? []);

  const accessibleDepts = allDepts.filter((dept) => accessibleDeptIds.includes(dept.id));

  // Reconcile stored selection against current accessible list on every org/user change.
  //
  // CRITICAL: skip while the dept list is loading (or the user has no accessible
  // depts yet). For global admins `accessibleDeptIds = allDepts.map(...)` which is
  // [] until useDepartments resolves — running the reconciliation in that empty
  // window would wipe the persisted selection on every page reload.
  useEffect(() => {
    if (isLoading) return;
    if (accessibleDeptIds.length === 0) return;
    const stored = getSelectedDeptIds();
    if (stored.length === 0) return;
    const valid = stored.filter((id) => accessibleDeptIds.includes(id));
    if (valid.length !== stored.length) {
      if (valid.length === 0) clear();
      else setSelected(valid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrganizationId, user?.id, isLoading, accessibleDeptIds.join(',')]);

  const selectedIds = getSelectedDeptIds().filter((id) => accessibleDeptIds.includes(id));

  const toggleDept = useCallback(
    (id: number) => {
      const next = selectedIds.includes(id)
        ? selectedIds.filter((sid) => sid !== id)
        : [...selectedIds, id];
      if (next.length === 0 || next.length === accessibleDepts.length) {
        clear(); // "All" state
      } else {
        setSelected(next);
      }
    },
    [selectedIds, accessibleDepts.length, clear, setSelected]
  );

  const handleSelectAll = useCallback(() => {
    clear();
    setIsOpen(false);
  }, [clear]);

  // Only show for multi-dept users
  if (isLoading || accessibleDepts.length <= 1) return null;

  // Label for the trigger button
  const isAll = selectedIds.length === 0;
  const label = isAll
    ? 'All departments'
    : selectedIds.length === 1
      ? (allDepts.find((dept) => dept.id === selectedIds[0])?.name ?? '1 dept')
      : `${selectedIds.length} departments`;

  return (
    <div className="relative mb-3">
      <Button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex justify-between items-center px-3 py-2 w-full text-sm font-medium rounded-md border text-foreground bg-card border-border hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <div className="flex flex-1 gap-2 items-center min-w-0">
          <Layers className="flex-shrink-0 w-4 h-4" />
          <span className="truncate">{label}</span>
          {!isAll && (
            <span className="flex-shrink-0 ml-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-primary text-primary-foreground">
              {selectedIds.length}
            </span>
          )}
        </div>
        <ChevronDown className="flex-shrink-0 w-4 h-4" />
      </Button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            role="button"
            tabIndex={0}
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
            onKeyDown={(ev) => {
              if (ev.key === 'Escape') setIsOpen(false);
            }}
            aria-label="Close department menu"
          />

          {/* Dropdown */}
          <div className="overflow-y-auto absolute left-0 bottom-full z-20 mb-2 w-full max-h-80 rounded-md border shadow-lg bg-card border-border">
            <div className="p-2">
              <p className="px-2 mb-1 text-[10px] font-semibold tracking-wide uppercase text-muted-foreground">
                Filter by department
              </p>

              {/* "All departments" row */}
              <button
                type="button"
                onClick={handleSelectAll}
                className={`flex justify-between items-center px-3 py-2 w-full text-sm text-left rounded-md transition-colors hover:bg-accent ${isAll ? 'text-primary font-medium' : ''}`}
              >
                <span>All departments</span>
                {isAll && <X className="w-3.5 h-3.5 opacity-50" />}
              </button>

              {/* Individual dept rows */}
              {accessibleDepts.map((dept) => {
                const checked = selectedIds.includes(dept.id);
                return (
                  <button
                    key={dept.id}
                    type="button"
                    onClick={() => toggleDept(dept.id)}
                    className="flex justify-between items-center px-3 py-2 w-full text-sm text-left rounded-md transition-colors hover:bg-accent"
                  >
                    <span className={checked ? 'font-medium' : ''}>{dept.name}</span>
                    {/* Checkbox visual */}
                    <span
                      className={`flex-shrink-0 w-4 h-4 rounded border transition-colors ${
                        checked ? 'bg-primary border-primary' : 'border-border'
                      }`}
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

              {/* Clear selection shortcut */}
              {!isAll && (
                <div className="border-t mt-1 pt-1">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="px-3 py-1.5 w-full text-xs text-left rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  >
                    Clear filter (show all)
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
