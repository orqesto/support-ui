import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const getSsoConfig = vi.fn();
const testSsoConfig = vi.fn();
vi.mock('@/services/sso.service', () => ({
  getSsoConfig: () => getSsoConfig() as unknown,
  putSsoConfig: vi.fn(),
  testSsoConfig: (input: unknown) => testSsoConfig(input) as unknown,
}));
vi.mock('@/services/organization.service', () => ({
  organizationService: { getCurrent: () => Promise.resolve({ allianceId: null }) },
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (state: { user: { role: string } }) => unknown) =>
    select({ user: { role: 'admin' } }),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { SSOConfigSettings } from '../SSOConfigSettings';

const startTest = async () => {
  getSsoConfig.mockResolvedValue({
    config: {
      protocol: 'oidc',
      enabled: true,
      issuerUrl: 'https://tested.example.com',
      clientId: 'client-1',
      scopes: null,
      allowedEmailDomains: ['example.com'],
      jitProvisioning: true,
      allowSsoAccountLinking: false,
      hasClientSecret: true,
    },
    redirectUri: 'https://app.example.com/cb',
  });
  let settle: (value: unknown) => void = () => {};
  testSsoConfig.mockImplementationOnce(() => new Promise((resolve) => (settle = resolve)));
  render(
    <MemoryRouter>
      <SSOConfigSettings />
    </MemoryRouter>
  );
  await screen.findByDisplayValue('https://tested.example.com');
  fireEvent.click(screen.getByRole('button', { name: /test connection/i }));
  return (value: unknown) =>
    act(async () => {
      settle(value);
      await Promise.resolve();
    });
};

describe('SSO — a test that lands after the issuer changed', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('⛔ does not vouch for an issuer it never discovered', async () => {
    const land = await startTest();
    fireEvent.change(screen.getByDisplayValue('https://tested.example.com'), {
      target: { value: 'https://other.example.com' },
    });
    await land({ ok: true, message: 'Discovery OK', issuer: 'https://tested.example.com' });

    expect(testSsoConfig.mock.calls[0][0]).toMatchObject({
      issuerUrl: 'https://tested.example.com',
    });
    expect(screen.queryByText('Discovery OK')).not.toBeInTheDocument();
  });

  it('CONTROL: a test nobody overtook reports', async () => {
    const land = await startTest();
    await land({ ok: true, message: 'Discovery OK', issuer: 'https://tested.example.com' });
    expect(screen.getByText('Discovery OK')).toBeInTheDocument();
  });
});
