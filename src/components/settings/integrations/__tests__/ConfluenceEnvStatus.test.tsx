/**
 * When the "use the server's Confluence service account" probe fails, the form has to
 * say WHICH failure it was. A missing org context (platform scope strips
 * `X-Organization-Context`) returns 400 and is otherwise indistinguishable from a
 * backend with no service account configured — both leave `envConfigured` false and
 * silently hide the toggle. Keeping the status is the entire reason the branch exists.
 *
 * It read `err.response.status`, which the api-client interceptor never produces, so
 * the status was always undefined and the admin got the vague sentence in every case.
 *
 * Fixtures come from the real interceptor via `@/test/apiError`.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const getConfluenceEnvStatus = vi.fn<(...args: unknown[]) => Promise<{ data?: { envConfigured?: boolean } }>>();
vi.mock('@/services/integrations.service', () => ({
  integrationsService: {
    getConfluenceEnvStatus: (...args: unknown[]) => getConfluenceEnvStatus(...args),
    upsert: vi.fn(),
    remove: vi.fn(),
    test: vi.fn(),
    toggle: vi.fn(),
    sync: vi.fn(),
    getById: vi.fn(),
  },
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/components/settings/integrations/ConfluenceDepartmentScope', () => ({
  ConfluenceDepartmentScope: () => null,
}));

import { ConfluenceIntegrationCard } from '@/components/settings/integrations/ConfluenceIntegrationCard';
import { apiError, networkError } from '@/test/apiError';

const openForm = () => {
  render(
    <ConfluenceIntegrationCard
      integrations={[]}
      onRefresh={vi.fn(async () => {})}
      onShowAlert={vi.fn()}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: /Add Confluence/i }));
};

describe('Confluence service-account probe names which failure it was', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it('reports the HTTP status, so a 400 is distinguishable from "not configured"', async () => {
    getConfluenceEnvStatus.mockRejectedValue(
      await apiError(400, { error: 'Organization context required' })
    );
    openForm();
    expect(await screen.findByText(/HTTP 400/)).toBeInTheDocument();
  });

  it('reports a 403 as itself, not as a missing service account', async () => {
    getConfluenceEnvStatus.mockRejectedValue(await apiError(403, { error: 'Forbidden' }));
    openForm();
    expect(await screen.findByText(/HTTP 403/)).toBeInTheDocument();
  });

  it('drops the status only when there genuinely is none', async () => {
    getConfluenceEnvStatus.mockRejectedValue(await networkError());
    openForm();
    expect(
      await screen.findByText(/Could not check for a server service account\./)
    ).toBeInTheDocument();
    expect(screen.queryByText(/HTTP/)).not.toBeInTheDocument();
  });

  it('shows no warning at all when the probe succeeds', () => {
    getConfluenceEnvStatus.mockResolvedValue({ data: { envConfigured: true } });
    openForm();
    expect(
      screen.queryByText(/Could not check for a server service account/)
    ).not.toBeInTheDocument();
  });
});
