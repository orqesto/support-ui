/**
 * "Back to app" must return the admin to the workspace they came FROM.
 *
 * The WorkspaceShell restores `selectedOrganizationId` on unmount to whatever it was when the
 * shell mounted. The platform Workspaces list's Manage action used to call
 * `setSelectedOrganization(org.id)` BEFORE navigating ("to avoid a flash"), so the shell
 * mounted with the borrowed org already selected, recorded THAT as the value to restore, and
 * "Back to app" walked the admin into the workspace they had merely been managing. Seen on
 * staging 2026-09-07 (stripe-test → Manage ratata → Back to app → ratata); the direct-URL
 * entry, which nothing pre-sets, restored correctly. The alliance console's Manage
 * (ConsoleOrganizations) never touched the store either.
 *
 * Source tripwire: the console org lists hand the shell a URL and nothing else.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (file: string) => readFileSync(resolve(here, '..', file), 'utf8');

describe('console Manage actions borrow nothing from the auth store', () => {
  it.each(['PlatformOrganizations.tsx', 'ConsoleOrganizations.tsx'])(
    '%s navigates to the WorkspaceShell without pre-setting the org context',
    (file) => {
      const source = read(file);
      expect(source).toMatch(/navigate\(`\/console\/workspace\/\$\{org\.id\}/);
      expect(source).not.toMatch(/setSelectedOrganization/);
    }
  );
});
