/**
 * Release review finding 7: the Free starter-allowance line on Billing & Usage (UsageStatsPage).
 * Shown while the workspace is on our AI; hidden on its own key, in own-key mode with no provider,
 * and on an older backend (no field) or a paid plan (null).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

let ai: unknown;
let providers: { platform: { active: boolean }; enabled: unknown[] };
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (url: string) => {
      if (url.includes('usage/current')) return Promise.resolve({ data: { ai } });
      if (url.includes('ai/providers')) {
        return Promise.resolve({ data: { success: true, data: { available: [], ...providers } } });
      }
      return Promise.resolve({
        data: {
          success: true,
          data: {
            usage: {
              aiCalls: { current: 3 },
              messages: { current: 10, limit: 500, percentage: 2 },
            },
          },
        },
      });
    },
  },
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
let viewer = { role: 'user', organizationRole: 'support' };
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (state: unknown) => unknown) => select({ user: viewer }),
}));

const { UsageStatsPage } = await import('../UsageStatsPage');

const aiBlock = (starterAllowance: unknown, over: Record<string, unknown> = {}) => ({
  currency: 'USD',
  active: true,
  usedMicros: null,
  budgetMicros: null,
  paused: false,
  bulkPaused: false,
  reason: null,
  message: null,
  resetsAt: null,
  starterAllowance,
  ...over,
});
const allowance = {
  totalMicros: 400_000,
  usedMicros: 148_000,
  remainingMicros: 252_000,
  exhausted: false,
};

const show = async () => {
  render(
    <MemoryRouter>
      <UsageStatsPage />
    </MemoryRouter>
  );
  await screen.findByText('Billing & Usage');
};

beforeEach(() => {
  viewer = { role: 'user', organizationRole: 'support' };
  providers = { platform: { active: true }, enabled: [] };
});
afterEach(cleanup);

describe('Usage Stats: starter allowance line', () => {
  it('on our AI, an agent: messages left, no money', async () => {
    ai = aiBlock(allowance);
    await show();
    const line = await screen.findByTestId('starter-allowance-line');
    expect(line).toHaveTextContent('AI starter allowance: about 63 of 100 messages left.');
    expect(line).not.toHaveTextContent(/\$/);
  });

  it('an admin also reads the money', async () => {
    viewer = { role: 'user', organizationRole: 'org_admin' };
    ai = aiBlock(allowance);
    await show();
    expect(await screen.findByTestId('starter-allowance-line')).toHaveTextContent(
      '(≈ $0.25 of $0.40 left)'
    );
  });

  it('own key: no line', async () => {
    providers = { platform: { active: false }, enabled: [{ id: 1 }] };
    ai = aiBlock(allowance);
    await show();
    await waitFor(() => expect(screen.getByText('Total Used')).toBeInTheDocument());
    expect(screen.queryByTestId('starter-allowance-line')).not.toBeInTheDocument();
  });

  it('own-key mode with no provider (AI off): no line', async () => {
    providers = { platform: { active: false }, enabled: [] };
    ai = aiBlock(allowance);
    await show();
    await waitFor(() => expect(screen.getByText('Total Used')).toBeInTheDocument());
    expect(screen.queryByTestId('starter-allowance-line')).not.toBeInTheDocument();
  });

  it('paid plan (null) or an older backend (no ai block): no line, the page renders', async () => {
    ai = aiBlock(null);
    await show();
    expect(screen.queryByTestId('starter-allowance-line')).not.toBeInTheDocument();
    cleanup();
    ai = undefined;
    await show();
    expect(screen.queryByTestId('starter-allowance-line')).not.toBeInTheDocument();
  });
});
