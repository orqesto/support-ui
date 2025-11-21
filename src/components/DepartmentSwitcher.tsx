import { useState, useEffect, useMemo } from 'react';
import { Briefcase, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/authStore';
import type { DepartmentRole } from '@/types';

const DEPARTMENT_LABELS: Record<DepartmentRole, string> = {
  general: 'General',
  support: 'Support',
  sales: 'Sales',
  billing: 'Billing',
};

const DEPARTMENT_DESCRIPTIONS: Record<DepartmentRole, string> = {
  support: 'Technical support & customer service',
  sales: 'Sales inquiries & demos',
  billing: 'Billing, invoices & payments',
  general: 'General inquiries',
};

export const DepartmentSwitcher = () => {
  const user = useAuthStore((state) => state.user);
  const selectedDepartmentRole = useAuthStore((state) => state.selectedDepartmentRole);
  const setSelectedDepartment = useAuthStore((state) => state.setSelectedDepartment);

  const [isOpen, setIsOpen] = useState(false);

  // Get user's departments (memoized to prevent useEffect issues)
  const departments = useMemo(() => user?.departmentRoles ?? [], [user?.departmentRoles]);

  // Only show if user has multiple departments
  const showSwitcher = departments.length > 1;

  // Auto-select first department if none selected and user has departments
  useEffect(() => {
    if (!selectedDepartmentRole && departments.length > 0) {
      const department = departments.find((dept) => dept === 'general');
      setSelectedDepartment(department ?? departments[0]);
    }
  }, [selectedDepartmentRole, departments, setSelectedDepartment]);

  // Log current department on mount and when it changes
  useEffect(() => {
    if (selectedDepartmentRole) {
      // eslint-disable-next-line no-console
      console.log(
        `🏷️ [DEPT SWITCHER] Current Department: ${DEPARTMENT_LABELS[selectedDepartmentRole]} (${selectedDepartmentRole})`
      );
    } else if (departments.length > 0) {
      console.warn('⚠️ [DEPT SWITCHER] No department selected, but user has departments!');
    }
  }, [selectedDepartmentRole, departments]);

  const handleSelectDepartment = (dept: DepartmentRole) => {
    // eslint-disable-next-line no-console
    console.log(`🔄 [DEPT SWITCHER] Switching to department: ${DEPARTMENT_LABELS[dept]} (${dept})`);

    setSelectedDepartment(dept);
    setIsOpen(false);

    // Clear URL parameters (closes any open message/ticket) and reload
    // eslint-disable-next-line no-console
    console.log(
      '🔄 [DEPT SWITCHER] Clearing selection and reloading to apply new department context...'
    );
    const baseUrl = window.location.pathname; // e.g., /messages or /tickets
    window.location.href = baseUrl; // Navigate to base URL without params, triggering reload
  };

  if (!showSwitcher) {
    return null;
  }

  const selectedLabel = selectedDepartmentRole
    ? DEPARTMENT_LABELS[selectedDepartmentRole]
    : 'Select Department';

  return (
    <div className="relative mb-3">
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className="flex justify-between items-center px-3 py-2 w-full text-sm font-medium rounded-md border text-foreground bg-card border-border hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <div className="flex flex-1 gap-2 items-center min-w-0">
          <Briefcase className="flex-shrink-0 w-4 h-4" />
          <span className="truncate">{selectedLabel}</span>
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
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setIsOpen(false);
              }
            }}
            aria-label="Close department menu"
          />

          {/* Dropdown */}
          <div className="overflow-y-auto absolute left-0 bottom-full z-20 mb-2 w-full max-h-64 rounded-md border shadow-lg bg-card border-border">
            <div className="p-2">
              {departments.map((dept) => (
                <Button
                  key={dept}
                  variant="ghost"
                  onClick={() => handleSelectDepartment(dept)}
                  className="flex justify-between items-center px-3 py-2 w-full h-auto text-sm text-left rounded-md transition-colors hover:bg-accent"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{DEPARTMENT_LABELS[dept]}</div>
                    <div className="text-xs truncate text-muted-foreground">
                      {DEPARTMENT_DESCRIPTIONS[dept]}
                    </div>
                  </div>
                  {selectedDepartmentRole === dept && (
                    <Check className="flex-shrink-0 ml-2 w-4 h-4 text-primary" />
                  )}
                </Button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
