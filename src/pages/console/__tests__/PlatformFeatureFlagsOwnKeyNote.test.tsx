import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AdminFeatureFlag } from '@/services/featureFlags.service';

/**
 * Owner, 2026-10-07: the global kb.* switches were set in the console and did nothing for a
 * workspace on its own AI key — on a HOSTED deployment such a workspace reads only its own row.
 * At global scope the three kb.* rows say so; at a workspace's scope, or on a self-hosted install
 * (where the global row does reach every workspace), they do not.
 */

const flag = (key: string): AdminFeatureFlag => ({
  key,
  codeDefault: false,
  global: null,
  organization: null,
  effective: false,
  source: 'code_default',
});

const KB_KEYS = [
  'kb.consolidation_enabled',
  'kb.consolidation_dry_run',
  'kb.quality_review_enabled',
];
const flags: AdminFeatureFlag[] = [...KB_KEYS.map(flag), flag('learning.breadth_downweight')];

/** The list at a WORKSPACE's scope (null ⇒ the same list as global). */
let workspaceFlags: AdminFeatureFlag[] | null = null;
const setFlag = vi.fn((_input: { key: string; enabled: boolean; organizationId?: number | null }) =>
  Promise.resolve()
);
vi.mock('@/services/featureFlags.service', () => ({
  featureFlagAdminService: {
    listAdmin: (organizationId?: number | null) =>
      Promise.resolve({
        organizationId: organizationId ?? null,
        flags:
          organizationId !== null && organizationId !== undefined && workspaceFlags
            ? workspaceFlags
            : flags,
      }),
    setFlag: (input: { key: string; enabled: boolean; organizationId?: number | null }) =>
      setFlag(input),
    clearFlag: () => Promise.resolve(),
  },
}));
vi.mock('@/services/organization.service', () => ({
  organizationService: {
    getAllPages: () =>
      Promise.resolve({
        data: [{ id: 4, name: 'CoreSarms' }],
        pagination: { page: 1, limit: 100, total: 1, totalPages: 1, hasMore: false },
      }),
  },
}));
/** undefined: the version has not been read (yet) — nothing may be claimed. */
let deployment: { selfHostedDeployment: boolean; selfHosted: boolean } | undefined;
vi.mock('@/hooks/useBackendVersion', () => ({
  useBackendVersion: () => ({ data: deployment }),
}));

const {
  PlatformFeatureFlags,
  OWN_KEY_GLOBAL_NOTE,
  OWN_KEY_WORKSPACE_NOTE,
  OWN_KEY_SOURCE_LABEL,
  DRY_RUN_WARNING,
  clearOverrideHint,
} = await import('../PlatformFeatureFlags');

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PlatformFeatureFlags />
    </QueryClientProvider>
  );
};
const rowFor = async (key: string): Promise<HTMLElement> =>
  (await screen.findByText(key)).closest('li') as HTMLElement;

afterEach(cleanup);
beforeEach(() => {
  deployment = { selfHostedDeployment: false, selfHosted: false };
  workspaceFlags = null;
  setFlag.mockClear();
});

describe('PlatformFeatureFlags — own-key note on the kb.* switches', () => {
  it('global scope, hosted ⇒ each kb.* row carries the note; other flags do not', async () => {
    renderPage();
    for (const key of KB_KEYS)
      expect(within(await rowFor(key)).getByText(OWN_KEY_GLOBAL_NOTE)).toBeInTheDocument();
    expect(
      within(await rowFor('learning.breadth_downweight')).queryByText(OWN_KEY_GLOBAL_NOTE)
    ).toBeNull();
  });

  it('hosted is read from selfHostedDeployment, not the billing-derived selfHosted', async () => {
    // A managed box before billing is on reports selfHosted true — it is still hosted.
    deployment = { selfHostedDeployment: false, selfHosted: true };
    renderPage();
    expect(within(await rowFor(KB_KEYS[0])).getByText(OWN_KEY_GLOBAL_NOTE)).toBeInTheDocument();
  });

  it('self-hosted ⇒ no note (the global row reaches every workspace there)', async () => {
    deployment = { selfHostedDeployment: true, selfHosted: true };
    renderPage();
    await rowFor(KB_KEYS[0]);
    expect(screen.queryByText(OWN_KEY_GLOBAL_NOTE)).toBeNull();
  });

  it('deployment not known yet ⇒ no note', async () => {
    deployment = undefined;
    renderPage();
    await rowFor(KB_KEYS[0]);
    expect(screen.queryByText(OWN_KEY_GLOBAL_NOTE)).toBeNull();
  });

  it("a workspace's scope ⇒ no note", async () => {
    renderPage();
    await rowFor(KB_KEYS[0]);
    expect(screen.getAllByText(OWN_KEY_GLOBAL_NOTE)).toHaveLength(3);
    await screen.findByRole('option', { name: 'CoreSarms' });
    fireEvent.change(screen.getByLabelText('Editing'), { target: { value: '4' } });
    await rowFor(KB_KEYS[0]);
    expect(screen.queryByText(OWN_KEY_GLOBAL_NOTE)).toBeNull();
  });
});

/** Audit pass 2 (MED): at a workspace's scope the console must show what the job does. */
describe('PlatformFeatureFlags — workspace scope, global row does not reach (globalReaches)', () => {
  const GLOBAL_ON = { enabled: true, updatedAt: '2026-10-07T00:00:00Z', updatedBy: 1, notes: null };
  const atWorkspace = async () => {
    renderPage();
    await screen.findByRole('option', { name: 'CoreSarms' });
    fireEvent.change(screen.getByLabelText('Editing'), { target: { value: '4' } });
  };
  // What BE 25f329c4 sends for an own-key workspace on a hosted deployment, global row ON.
  const ownKey = (key: string): AdminFeatureFlag => ({
    ...flag(key),
    global: GLOBAL_ON,
    effective: false,
    source: 'code_default',
    globalReaches: false,
  });

  it('own key: the toggle shows Off, the note shows, no "global says on", and one click sends enabled: true', async () => {
    workspaceFlags = KB_KEYS.map(ownKey);
    await atWorkspace();
    await waitFor(() =>
      expect(screen.getAllByText(OWN_KEY_WORKSPACE_NOTE)).toHaveLength(KB_KEYS.length)
    );
    const row = await rowFor('kb.consolidation_enabled');
    const toggle = within(row).getByRole('switch');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(within(row).queryByText(/global says on/)).toBeNull();
    // The badge names the own-key rule, not "code default" (audit pass 3).
    expect(within(row).getByText(OWN_KEY_SOURCE_LABEL)).toBeInTheDocument();
    expect(within(row).queryByText('code default')).toBeNull();
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(setFlag).toHaveBeenCalledWith({
        key: 'kb.consolidation_enabled',
        enabled: true,
        organizationId: 4,
      })
    );
  });

  it('own key WITH a workspace row: the row decides — "workspace override" badge, no own-key note (audit pass 4)', async () => {
    const WORKSPACE_ON = { enabled: true, updatedAt: '2026-10-07T00:00:00Z', updatedBy: 1, notes: null };
    workspaceFlags = KB_KEYS.map((key) => ({
      ...ownKey(key),
      organization: WORKSPACE_ON,
      effective: true,
      source: 'organization' as const,
    }));
    await atWorkspace();
    const row = await rowFor('kb.consolidation_enabled');
    await waitFor(() => expect(within(row).getByText('workspace override')).toBeInTheDocument());
    expect(within(row).getByRole('switch').getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByText(OWN_KEY_WORKSPACE_NOTE)).toBeNull();
    expect(screen.queryByText(OWN_KEY_SOURCE_LABEL)).toBeNull();
    // The global row never reaches this workspace: no "global says on" (audit pass 5).
    expect(within(row).queryByText(/global says/)).toBeNull();
  });

  it('the page wires the own-key Clear-override hint (audit pass 6)', async () => {
    const WORKSPACE_ON = { enabled: true, updatedAt: '2026-10-07T00:00:00Z', updatedBy: 1, notes: null };
    workspaceFlags = KB_KEYS.map((key) => ({
      ...ownKey(key),
      organization: WORKSPACE_ON,
      effective: true,
      source: 'organization' as const,
    }));
    await atWorkspace();
    const row = await rowFor('kb.consolidation_enabled');
    const clear = await waitFor(() => within(row).getByRole('button', { name: 'Clear override' }));
    fireEvent.mouseEnter(clear.parentElement as HTMLElement);
    expect((await screen.findByRole('tooltip')).textContent).toBe(clearOverrideHint(true, true));
  });

  it('Clear override says where an own-key workspace falls back to (audit pass 5)', () => {
    expect(clearOverrideHint(true, true)).toMatch(/does not reach this workspace, so it falls back to off/);
    expect(clearOverrideHint(true, false)).toBe('Remove this override so the flag falls back to the layer below');
    expect(clearOverrideHint(false, true)).toBe('No override at this scope to remove');
  });

  it('managed workspace (globalReaches true): no note, the global value shows as such', async () => {
    workspaceFlags = KB_KEYS.map((key) => ({
      ...flag(key),
      global: GLOBAL_ON,
      effective: true,
      source: 'global' as const,
      globalReaches: true,
    }));
    await atWorkspace();
    const row = await rowFor('kb.consolidation_enabled');
    await waitFor(() => expect(within(row).getByText(/global says on/)).toBeInTheDocument());
    expect(screen.queryByText(OWN_KEY_WORKSPACE_NOTE)).toBeNull();
    expect(screen.queryByText(OWN_KEY_SOURCE_LABEL)).toBeNull();
  });

  it('global scope: no workspace note even if a flag carried globalReaches false', async () => {
    flags.splice(0, flags.length, ...KB_KEYS.map(ownKey), flag('learning.breadth_downweight'));
    try {
      renderPage();
      await rowFor(KB_KEYS[0]);
      expect(screen.queryByText(OWN_KEY_WORKSPACE_NOTE)).toBeNull();
    } finally {
      flags.splice(0, flags.length, ...KB_KEYS.map(flag), flag('learning.breadth_downweight'));
    }
  });

  it('old backend (no globalReaches): unchanged — "global says on", no note', async () => {
    workspaceFlags = KB_KEYS.map((key) => ({
      ...flag(key),
      global: GLOBAL_ON,
      effective: true,
      source: 'global' as const,
    }));
    await atWorkspace();
    const row = await rowFor('kb.consolidation_enabled');
    await waitFor(() => expect(within(row).getByText(/global says on/)).toBeInTheDocument());
    expect(within(row).getByRole('switch').getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByText(OWN_KEY_WORKSPACE_NOTE)).toBeNull();
  });

  it('the dry-run row warns at both scopes; other rows do not', async () => {
    renderPage();
    const globalRow = await rowFor('kb.consolidation_dry_run');
    expect(within(globalRow).getByText(DRY_RUN_WARNING)).toBeInTheDocument();
    expect(screen.getAllByText(DRY_RUN_WARNING)).toHaveLength(1);
    await screen.findByRole('option', { name: 'CoreSarms' });
    fireEvent.change(screen.getByLabelText('Editing'), { target: { value: '4' } });
    await waitFor(() => expect(screen.queryByText(OWN_KEY_GLOBAL_NOTE)).toBeNull());
    expect(
      within(await rowFor('kb.consolidation_dry_run')).getByText(DRY_RUN_WARNING)
    ).toBeInTheDocument();
  });
});
