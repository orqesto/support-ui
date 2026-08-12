import { Fragment } from 'react';
import { Layout } from '@/components/layout/Layout';
import { WorkspaceDetailsSettings } from '@/components/settings/WorkspaceDetailsSettings';

/**
 * Current-workspace details view/editor. The customer-facing home for this is now
 * Settings › Workspace › Details (the standalone `/organization` nav tab was retired and
 * that route redirects here). This component remains for the global-admin WorkspaceShell,
 * which embeds it (`embedded`) to show a specific workspace's details inside the console.
 */
export const OrganizationPage = ({ embedded = false }: { embedded?: boolean } = {}) => {
  // Embedded in the WorkspaceShell → render into its chrome via a Fragment;
  // standalone → wrap in the org-scoped Layout.
  const Wrap = embedded ? Fragment : Layout;
  return (
    <Wrap>
      <div className="px-4 mx-auto space-y-4 w-full">
        <div>
          <h2 className="text-2xl font-bold">Workspace Settings</h2>
          <p className="text-sm text-muted-foreground">Manage your workspace&apos;s details</p>
        </div>
        <WorkspaceDetailsSettings />
      </div>
    </Wrap>
  );
};
