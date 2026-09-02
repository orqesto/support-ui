/**
 * The panel must not present a key nobody is calling as a working provider.
 *
 * Managed workspace, 2026-09-02: "Total Providers 2 / Enabled 2", a green "OpenAI ✓ validated"
 * card above a red Platform AI card. One credential was answering — the platform's — and the
 * other was the org's own dormant row, counted beside it, badged Enabled, and looking healthier
 * than the one that was actually failing. An afternoon went into debugging the key that was not
 * in use.
 *
 * ⛔ The dormant row is NOT hidden. An admin about to switch back to their own key needs to see
 * whether it still works. What it must not do is claim to be on.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { AIProviderHealthCheck } from '../AIProviderHealthCheck';

const get = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args) as unknown,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const PLATFORM = {
  id: 0,
  name: 'Platform AI',
  provider: 'platform',
  enabled: true,
  status: 'unhealthy' as const,
  message: "The platform's openai credential was rejected (401 Unauthorized).",
  inUse: true,
};

/** `enabled: true` is deliberate — the backend leaves the column alone on a dormant row. */
const DORMANT_BYO = {
  id: 7,
  name: 'OpenAI',
  provider: 'openai',
  enabled: true,
  status: 'healthy' as const,
  message: 'OpenAI API key validated successfully — not in use: managed AI is serving this workspace.',
  inUse: false,
};

const respondWith = (providers: unknown[], summary: Record<string, number>) =>
  get.mockResolvedValue({ data: { success: true, data: { providers, summary } } });

describe('AI provider health — managed workspace', () => {
  it('counts only what serves, and says where the difference went', async () => {
    respondWith([PLATFORM, DORMANT_BYO], {
      total: 1,
      healthy: 0,
      unhealthy: 1,
      enabled: 1,
      notInUse: 1,
    });

    render(<AIProviderHealthCheck />);

    expect(await screen.findByText('Platform AI')).toBeTruthy();
    expect(screen.getByText(/of your own, not in use/)).toBeTruthy();
  });

  it('badges the dormant key "Not in use", never "Enabled"', async () => {
    respondWith([PLATFORM, DORMANT_BYO], {
      total: 1,
      healthy: 0,
      unhealthy: 1,
      enabled: 1,
      notInUse: 1,
    });

    render(<AIProviderHealthCheck />);

    // The row is still there — this is what an admin switching back needs to read.
    const dormantCard = (await screen.findByText('OpenAI')).closest('div.border');
    expect(dormantCard).toBeTruthy();
    expect(within(dormantCard as HTMLElement).getByText('Not in use')).toBeTruthy();
    expect(within(dormantCard as HTMLElement).queryByText('Enabled')).toBeNull();
    expect(screen.getByText(/not in use while managed AI is on/)).toBeTruthy();
  });

  it('CONTROL: a BYO workspace is unchanged — every row is in use and badged Enabled', async () => {
    // No `inUse` at all: both a BYO org and any backend older than this change.
    const byo = [
      { ...DORMANT_BYO, inUse: undefined, message: 'OpenAI API key validated successfully' },
      { ...DORMANT_BYO, id: 8, name: 'Anthropic', provider: 'anthropic', inUse: undefined },
    ];
    respondWith(byo, { total: 2, healthy: 2, unhealthy: 0, enabled: 2, notInUse: 0 });

    render(<AIProviderHealthCheck />);

    expect(await screen.findByText('Anthropic')).toBeTruthy();
    // `selector` scopes this to the row badges — "Enabled" is also the summary tile's label.
    expect(screen.getAllByText('Enabled', { selector: 'span' })).toHaveLength(2);
    expect(screen.queryByText('Not in use')).toBeNull();
    expect(screen.queryByText(/not in use while managed AI is on/)).toBeNull();
    expect(screen.queryByText(/of your own, not in use/)).toBeNull();
  });
});
