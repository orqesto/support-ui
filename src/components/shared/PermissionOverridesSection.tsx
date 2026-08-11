import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { PermissionCheckboxGrid } from './PermissionCheckboxGrid';
import type { OrganizationRole, Permission, PermissionOverrides } from '@/types/roles';

type PermissionOverridesSectionProps = {
  role: OrganizationRole;
  value: PermissionOverrides;
  onChange: (next: PermissionOverrides) => void;
};

/**
 * Collapsed-by-default "Customize permissions" section. Wraps the
 * PermissionCheckboxGrid so the edit modal stays manageable and the section
 * can be reused from invite flow / other admin surfaces.
 */
export const PermissionOverridesSection = ({
  role,
  value,
  onChange,
}: PermissionOverridesSectionProps) => {
  const [open, setOpen] = useState(false);
  const overrideCount = (value.added?.length ?? 0) + (value.removed?.length ?? 0);

  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen((prev) => !prev)}
        className="gap-1 items-center p-0 h-auto text-sm font-medium hover:text-primary"
      >
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        Customize permissions
        {overrideCount > 0 && (
          <span className="ml-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-primary/10 text-primary">
            {overrideCount}
          </span>
        )}
      </Button>
      {open && (
        <div className="mt-3">
          <PermissionCheckboxGrid
            role={role}
            overrides={value as { added?: Permission[]; removed?: Permission[] }}
            onChange={onChange}
          />
        </div>
      )}
    </div>
  );
};
