import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AdminFeatureFlag } from '@/services/featureFlags.service';

/**
 * The page exists because nothing could turn a flag on. What it must not do is make
 * the two write actions look like one: setting a flag `false` and REMOVING the
 * override are different, and only the second lets a later global rollout reach the
 * workspace. These pin that difference, plus the layer a value came from.
 */

const flag = (over: Partial<AdminFeatureFlag> = {}): AdminFeatureFlag => ({
  key: 'learning.breadth_downweight',
  codeDefault: false,
  global: null,
  organization: null,
  effective: false,
  source: 'code_default',
  ...over,
});

let flags: AdminFeatureFlag[] = [flag()];
type SetInput = { key: string; enabled: boolean; organizationId?: number | null };
const setFlag = vi.fn<(input: SetInput) => Promise<void>>().mockResolvedValue(undefined);
const clearFlag =
  vi.fn<(key: string, organizationId?: number | null) => Promise<void>>().mockResolvedValue(undefined);

// Replaced wholesale rather than spread over the real module: the only runtime
// export the page uses is `featureFlagAdminService`, and `AdminFeatureFlag` is a
// type import, which is erased before this ever runs.
vi.mock('@/services/featureFlags.service', () => ({
  featureFlagAdminService: {
    listAdmin: () => Promise.resolve({ organizationId: null, flags }),
    setFlag,
    clearFlag,
  },
}));

vi.mock('@/services/organization.service', () => ({
  organizationService: {
    getAll: () =>
      Promise.resolve({
        data: [{ id: 4, name: 'CoreSarms' }],
        pagination: { page: 1, limit: 100, total: 1, totalPages: 1, hasMore: false },
      }),
  },
}));

const { PlatformFeatureFlags } = await import('../PlatformFeatureFlags');

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PlatformFeatureFlags />
    </QueryClientProvider>
  );
};

const rowFor = async (key: string): Promise<HTMLElement> => {
  const label = await screen.findByText(key);
  return label.closest('li') as HTMLElement;
};

afterEach(cleanup);
beforeEach(() => {
  flags = [flag()];
  setFlag.mockClear();
  clearFlag.mockClear();
});

describe('PlatformFeatureFlags', () => {
  it('says which layer decided the value, not just on/off', async () => {
    flags = [
      flag(),
      flag({
        key: 'learning.reply_style_emit_suggestion',
        codeDefault: true,
        effective: true,
        source: 'code_default',
      }),
      flag({
        key: 'routing.rule_dept_cap',
        global: { enabled: true, updatedAt: '2026-09-01T00:00:00Z', updatedBy: 1, notes: null },
        effective: true,
        source: 'global',
      }),
    ];
    renderPage();

    const overridden = await rowFor('routing.rule_dept_cap');
    expect(within(overridden).getByText('global override')).toBeInTheDocument();

    const untouched = await rowFor('learning.breadth_downweight');
    expect(within(untouched).getByText('code default')).toBeInTheDocument();
    // The shipped value stays visible even when an override is in force, so an admin
    // can see what "clear override" would fall back to.
    expect(within(untouched).getByText(/ships off/)).toBeInTheDocument();
  });

  it('toggling writes an override at the scope being edited', async () => {
    renderPage();
    const row = await rowFor('learning.breadth_downweight');
    fireEvent.click(within(row).getByRole('switch'));
    // react-query hands the mutation off to a microtask, so the assertion has to
    // wait for it — a synchronous check here passes only by accident.
    await waitFor(() =>
      expect(setFlag).toHaveBeenCalledWith({
        key: 'learning.breadth_downweight',
        enabled: true,
        organizationId: null,
      })
    );
  });

  it('clear override is a DIFFERENT call from toggling off', async () => {
    // The distinction the backend tests pin: an org row of `false` out-votes a later
    // global rollout, so "stop overriding" must not be spelled as "set false".
    flags = [
      flag({
        global: { enabled: true, updatedAt: '2026-09-01T00:00:00Z', updatedBy: 1, notes: null },
        effective: true,
        source: 'global',
      }),
    ];
    renderPage();
    const row = await rowFor('learning.breadth_downweight');
    fireEvent.click(within(row).getByRole('button', { name: /clear override/i }));
    await waitFor(() => expect(clearFlag).toHaveBeenCalledWith('learning.breadth_downweight', null));
    expect(setFlag).not.toHaveBeenCalled();
  });

  it('cannot clear a scope that has no override of its own', async () => {
    // Without this the button is a no-op an admin cannot tell apart from a failure.
    renderPage();
    const row = await rowFor('learning.breadth_downweight');
    expect(within(row).getByRole('button', { name: /clear override/i })).toBeDisabled();
  });

  it('surfaces a write failure instead of silently reverting to the old value', async () => {
    setFlag.mockRejectedValueOnce(new Error('Unknown feature flag'));
    renderPage();
    const row = await rowFor('learning.breadth_downweight');
    fireEvent.click(within(row).getByRole('switch'));
    expect(await screen.findByText('Unknown feature flag')).toBeInTheDocument();
  });
});
