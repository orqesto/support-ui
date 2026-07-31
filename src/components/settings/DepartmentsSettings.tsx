import { DepartmentsManager } from '@/components/departments/DepartmentsManager';

/**
 * Settings → Organization → Departments. Same DepartmentsManager the onboarding
 * wizard uses, so departments are fully manageable (add / remove / restore /
 * default) after setup — which is what the wizard's "manage in Settings" copy
 * promises.
 */
export const DepartmentsSettings = () => (
  <div className="space-y-4">
    <div>
      <h3 className="text-lg font-semibold text-foreground">Departments</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Departments are where incoming messages get routed. Add or remove them, and star the
        default that catches anything unmatched. Removed departments can be restored anytime.
      </p>
    </div>
    <DepartmentsManager />
  </div>
);
