import { useState, useEffect, useMemo } from 'react';
import { Briefcase, ChevronDown, Check, Lock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/authStore';
import type { DepartmentRole } from '@/types';

const DEPARTMENT_LABELS: Record<DepartmentRole, string> = {
  general: 'General',
  support: 'Support',
  sales: 'Sales',
  billing: 'Billing',
  hr: 'HR',
};

const DEPARTMENT_DESCRIPTIONS: Record<DepartmentRole, string> = {
  support: 'Technical support & customer service',
  sales: 'Sales inquiries & demos',
  billing: 'Billing, invoices & payments',
  general: 'General inquiries',
  hr: 'HR & employee relations',
};

// All available departments
const ALL_DEPARTMENTS: DepartmentRole[] = ['support', 'sales', 'billing', 'general', 'hr'];

export const DepartmentSwitcher = () => {
  const user = useAuthStore((state) => state.user);
  const selectedDepartmentRole = useAuthStore((state) => state.selectedDepartmentRole);
  const setSelectedDepartment = useAuthStore((state) => state.setSelectedDepartment);

  const [isOpen, setIsOpen] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');

  // Get user's assigned departments (memoized to prevent useEffect issues)
  const userDepartments = useMemo(() => user?.departmentRoles ?? [], [user?.departmentRoles]);

  // Auto-select first department if none selected and user has departments
  useEffect(() => {
    if (!selectedDepartmentRole && userDepartments.length > 0) {
      const department = userDepartments.find((dept) => dept === 'general');
      setSelectedDepartment(department ?? userDepartments[0]);
    }
  }, [selectedDepartmentRole, userDepartments, setSelectedDepartment]);

  // Hide warning after 5 seconds
  useEffect(() => {
    if (showWarning) {
      const timer = setTimeout(() => {
        setShowWarning(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showWarning]);

  const handleSelectDepartment = (dept: DepartmentRole) => {
    const hasAccess = userDepartments.includes(dept);
    
    // Show warning if user doesn't have access to this department
    if (!hasAccess) {
      setWarningMessage(
        `You don't have access to the ${DEPARTMENT_LABELS[dept]} department. Please contact your administrator to request access.`
      );
      setShowWarning(true);
      setIsOpen(false);
      return; // Don't switch department if no access
    }
    
    // If selecting the same department, just close the dropdown
    if (dept === selectedDepartmentRole) {
      setIsOpen(false);
      return; // No need to reload
    }
    
    // Only switch department if user has access
    setSelectedDepartment(dept);
    setIsOpen(false);

    // Clear URL parameters (closes any open message/ticket) and reload
    const baseUrl = window.location.pathname; // e.g., /messages or /tickets
    window.location.href = baseUrl; // Navigate to base URL without params, triggering reload
  };

  // Don't show if user has no departments at all
  if (!user || userDepartments.length === 0) {
    return null;
  }

  const selectedLabel = selectedDepartmentRole
    ? DEPARTMENT_LABELS[selectedDepartmentRole]
    : 'Select Department';

  const hasAccessToSelected = selectedDepartmentRole 
    ? userDepartments.includes(selectedDepartmentRole)
    : false;

  return (
    <div className="mb-3">
      {/* Warning Banner */}
      {showWarning && (
        <div className="flex gap-2 items-start mb-2 p-2 rounded-md border bg-amber-500/10 border-amber-500/30">
          <AlertCircle className="flex-shrink-0 mt-0.5 w-4 h-4 text-amber-600 dark:text-amber-500" />
          <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
            {warningMessage}
          </p>
        </div>
      )}

      <div className="relative">
        <Button
          onClick={() => setIsOpen(!isOpen)}
          className="flex justify-between items-center px-3 py-2 w-full text-sm font-medium rounded-md border text-foreground bg-card border-border hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <div className="flex flex-1 gap-2 items-center min-w-0">
            <Briefcase className="flex-shrink-0 w-4 h-4" />
            <span className="truncate">{selectedLabel}</span>
            {!hasAccessToSelected && selectedDepartmentRole && (
              <Lock className="flex-shrink-0 w-3 h-3 text-amber-600 dark:text-amber-500" />
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
                {ALL_DEPARTMENTS.map((dept) => {
                  const hasAccess = userDepartments.includes(dept);
                  return (
                    <Button
                      key={dept}
                      variant="ghost"
                      onClick={() => handleSelectDepartment(dept)}
                      className={`flex justify-between items-center px-3 py-2 w-full h-auto text-sm text-left rounded-md transition-colors hover:bg-accent ${
                        !hasAccess ? 'opacity-60' : ''
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex gap-2 items-center">
                          <span className="font-medium truncate">{DEPARTMENT_LABELS[dept]}</span>
                          {!hasAccess && (
                            <Lock className="flex-shrink-0 w-3 h-3 text-muted-foreground" />
                          )}
                        </div>
                        <div className="text-xs truncate text-muted-foreground">
                          {DEPARTMENT_DESCRIPTIONS[dept]}
                          {!hasAccess && <span className="ml-1 text-amber-600 dark:text-amber-500">• No access</span>}
                        </div>
                      </div>
                      {selectedDepartmentRole === dept && (
                        <Check className="flex-shrink-0 ml-2 w-4 h-4 text-primary" />
                      )}
                    </Button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
