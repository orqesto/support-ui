import { DepartmentsManager } from '@/components/departments/DepartmentsManager';

/**
 * Step 1 — review/trim the auto-seeded departments (which come with routing rules
 * so they work out of the box). Removal is reversible. Creating new departments —
 * which need routing rules to receive mail — lives in the routing tools in
 * Settings, not here.
 */
export const DepartmentsStep = () => (
  <div className="space-y-4">
    <p className="text-sm text-muted-foreground">
      We set up common departments for you, each with routing rules so incoming messages reach the
      right one. Remove any you don&apos;t need — you can restore them anytime. Messages that
      don&apos;t match a department&apos;s rules go to a triage queue for manual routing.
    </p>
    <DepartmentsManager />
  </div>
);
