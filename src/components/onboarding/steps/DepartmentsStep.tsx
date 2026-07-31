import { DepartmentsManager } from '@/components/departments/DepartmentsManager';

/**
 * Step 1 — review/trim the auto-seeded departments and add your own. Removal is
 * reversible (restore from the "Removed" list), so nothing gets stranded. Backed
 * by the shared DepartmentsManager, which the same Settings section reuses.
 */
export const DepartmentsStep = () => (
  <div className="space-y-4">
    <p className="text-sm text-muted-foreground">
      We set up common departments for you — incoming messages get routed to them automatically.
      Remove the ones you don&apos;t need, add your own, and star the one where unmatched messages
      should land (the default). You can manage these anytime in Settings.
    </p>
    <DepartmentsManager />
  </div>
);
