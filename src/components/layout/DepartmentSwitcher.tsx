import { useState, useEffect, useCallback, useRef } from 'react';
import { Layers, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/authStore';
import { useDepartmentContextStore } from '@/stores/departmentContextStore';
import { useDepartments } from '@/hooks/useDepartments';
import { isDepartmentServed } from '@/utils/departmentReachability';
import { cn } from '@/lib/utils';
import { NavTip, railMenuStyle } from './SidebarNav';

type DepartmentSwitcherProps = {
  /** Icon-only trigger for the collapsed desktop rail; the menu opens beside it. */
  compact?: boolean;
};

export const DepartmentSwitcher = ({ compact = false }: DepartmentSwitcherProps = {}) => {
  const user = useAuthStore((state) => state.user);
  const selectedOrganizationId = useAuthStore((state) => state.selectedOrganizationId);

  const { data: allDepts = [], isLoading } = useDepartments();
  const { getSelectedDeptIds, setSelected, clear } = useDepartmentContextStore();

  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

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

  // Narrow the LIST to departments a live message source serves — you can't receive
  // tickets for the others, so filtering the inbox by one shows nothing. Keep any
  // already-selected dept visible so a stale selection stays removable.
  //
  // This narrows the options only; it must never decide whether the switcher renders
  // (see the visibility guard below).
  const servedDepts = accessibleDepts.filter(
    (dept) => isDepartmentServed(dept) || selectedIds.includes(dept.id)
  );

  const toggleDept = useCallback(
    (id: number) => {
      const next = selectedIds.includes(id)
        ? selectedIds.filter((sid) => sid !== id)
        : [...selectedIds, id];
      // Collapse to "All" once every row the menu actually offers is checked. Compare
      // against the served list, not every accessible dept — with an unserved dept in
      // the org the accessible count is unreachable, and the filter would stick.
      if (next.length === 0 || next.length === servedDepts.length) {
        clear(); // "All" state
      } else {
        setSelected(next);
      }
    },
    [selectedIds, servedDepts.length, clear, setSelected]
  );

  const handleSelectAll = useCallback(() => {
    clear();
    setIsOpen(false);
  }, [clear]);

  // Only show for multi-dept users. Gate on what the user can ACCESS, not on what a
  // message source currently serves: an org whose departments aren't wired to a
  // channel yet would otherwise lose the control altogether, with nothing on screen
  // to explain where it went. Source-reachability narrows the list inside, and the
  // empty state below says why it's empty.
  if (isLoading || accessibleDepts.length <= 1) return null;

  // Label for the trigger button
  const isAll = selectedIds.length === 0;
  const label = isAll
    ? 'All departments'
    : selectedIds.length === 1
      ? (allDepts.find((dept) => dept.id === selectedIds[0])?.name ?? '1 dept')
      : `${selectedIds.length} departments`;

  return (
    <div ref={triggerRef} className="relative mb-3">
      {compact ? (
        <NavTip label={`Departments: ${label}`}>
          <Button
            variant="ghost"
            onClick={() => setIsOpen((prev) => !prev)}
            aria-label={`Filter by department (current: ${label})`}
            aria-expanded={isOpen}
            className="flex relative justify-center items-center p-0 w-full h-9 rounded-md border text-foreground bg-card border-border hover:bg-accent"
          >
            <Layers className="w-4 h-4" />
            {!isAll && (
              <span className="flex absolute top-0 right-0.5 justify-center items-center min-w-[1rem] h-4 px-1 text-[9px] font-semibold rounded-full bg-primary text-primary-foreground">
                {selectedIds.length}
              </span>
            )}
          </Button>
        </NavTip>
      ) : (
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
      )}

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
          <div
            style={compact ? railMenuStyle(triggerRef.current) : undefined}
            className={cn(
              'overflow-y-auto z-20 max-h-80 rounded-md border shadow-lg bg-card border-border',
              compact ? 'w-64' : 'absolute left-0 bottom-full mb-2 w-full'
            )}
          >
            <div className="p-2">
              <p className="font-display px-2 mb-1 text-[10px] font-semibold tracking-[0.09em] uppercase text-muted-foreground">
                Filter by department
              </p>

              {/* "All departments" row */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
                className={`justify-between px-3 py-2 w-full h-auto text-sm text-left rounded-md hover:bg-accent ${isAll ? 'text-primary font-medium' : ''}`}
              >
                <span>All departments</span>
                {isAll && <X className="w-3.5 h-3.5 opacity-50" />}
              </Button>

              {/* No department is reachable yet — say so instead of showing a bare list */}
              {servedDepts.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  No department is served by a message channel yet. Connect a channel and route
                  it to a department in Settings › Channels.
                </p>
              )}

              {/* Individual dept rows */}
              {servedDepts.map((dept) => {
                const checked = selectedIds.includes(dept.id);
                return (
                  <Button
                    key={dept.id}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleDept(dept.id)}
                    className="justify-between px-3 py-2 w-full h-auto text-sm text-left rounded-md hover:bg-accent"
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
                  </Button>
                );
              })}

              {/* Clear selection shortcut */}
              {!isAll && (
                <div className="border-t mt-1 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleSelectAll}
                    className="justify-start px-3 py-1.5 w-full h-auto text-xs text-left rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    Clear filter (show all)
                  </Button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
