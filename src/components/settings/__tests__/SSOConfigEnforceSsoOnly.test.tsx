import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Settings › SSO — "Require SSO" (support-service #727, `org_sso_configs.enforce_sso_only`).
 *
 * The backend shipped the switch with no screen, and its PUT DEFAULTS an omitted
 * `enforceSsoOnly` to false — so the old form, which never sent the field, silently switched
 * enforcement OFF on every save. What must hold:
 * - the checkbox shows the value the server holds (absent on an older backend = off);
 * - EVERY save sends `enforceSsoOnly`, true or false, never omits it;
 * - turning it on shows the lock-out warning before the admin saves.
 */
type Config = Record<string, unknown>;
const getSsoConfig = vi.fn<() => Promise<{ config: Config | null; redirectUri: string }>>();
const putSsoConfig = vi.fn<(input: Record<string, unknown>) => Promise<Config>>();
vi.mock('@/services/sso.service', () => ({
  getSsoConfig: () => getSsoConfig(),
  putSsoConfig: (input: Record<string, unknown>) => putSsoConfig(input),
  testSsoConfig: vi.fn(),
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

const baseConfig = (extra: Config = {}): Config => ({
  protocol: 'oidc',
  enabled: true,
  issuerUrl: 'https://idp.example.com',
  clientId: 'client-1',
  scopes: null,
  allowedEmailDomains: ['example.com'],
  jitProvisioning: true,
  allowSsoAccountLinking: false,
  hasClientSecret: true,
  ...extra,
});

const renderLoaded = async (config: Config) => {
  getSsoConfig.mockResolvedValue({ config, redirectUri: 'https://app.example.com/cb' });
  putSsoConfig.mockImplementation((input) => Promise.resolve({ ...config, ...input }));
  render(
    <MemoryRouter>
      <SSOConfigSettings />
    </MemoryRouter>
  );
  return await screen.findByRole('checkbox', { name: /Require SSO/i });
};

const save = async () => {
  fireEvent.click(screen.getByRole('button', { name: /Save SSO settings/i }));
  await waitFor(() => expect(putSsoConfig).toHaveBeenCalledTimes(1));
  return putSsoConfig.mock.calls[0][0];
};

const WARNING = /cannot sign in until it is back/i;

describe('SSO settings — Require SSO (enforceSsoOnly)', () => {
  beforeEach(() => {
    getSsoConfig.mockReset();
    putSsoConfig.mockReset();
  });

  it('shows the value the server holds, with the lock-out warning when it is on', async () => {
    const box = await renderLoaded(baseConfig({ enforceSsoOnly: true }));
    expect((box as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(WARNING)).toBeTruthy();
  });

  it('keeps enforcement ON through an unrelated save (the field is sent, not omitted)', async () => {
    await renderLoaded(baseConfig({ enforceSsoOnly: true }));
    const body = await save();
    expect(body).toHaveProperty('enforceSsoOnly', true);
  });

  it('sends an explicit false when it is off', async () => {
    const box = await renderLoaded(baseConfig({ enforceSsoOnly: false }));
    expect((box as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByText(WARNING)).toBeNull();
    const body = await save();
    expect(body).toHaveProperty('enforceSsoOnly', false);
  });

  it('reads an older backend that does not send the field as off', async () => {
    const box = await renderLoaded(baseConfig());
    expect((box as HTMLInputElement).checked).toBe(false);
  });

  it('cannot be switched on while SSO itself is off (it would have nothing to enforce through)', async () => {
    const box = await renderLoaded(baseConfig({ enabled: false, enforceSsoOnly: false }));
    expect((box as HTMLInputElement).disabled).toBe(true);
  });

  it('turns itself off with SSO: an enforcement left ON with SSO off is shown and SAVED off', async () => {
    // The lock-out state (no password door, no SSO door) on a backend that predates the guard.
    const box = await renderLoaded(baseConfig({ enabled: false, enforceSsoOnly: true }));
    expect((box as HTMLInputElement).checked).toBe(false);
    const body = await save();
    expect(body).toHaveProperty('enforceSsoOnly', false);
  });

  it('switching SSO off also saves enforcement off', async () => {
    await renderLoaded(baseConfig({ enabled: true, enforceSsoOnly: true }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Enable SSO for this workspace/i }));
    const body = await save();
    expect(body).toHaveProperty('enabled', false);
    expect(body).toHaveProperty('enforceSsoOnly', false);
  });

  it('warns as soon as the admin ticks it, and saves true', async () => {
    const box = await renderLoaded(baseConfig({ enforceSsoOnly: false }));
    fireEvent.click(box);
    expect(screen.getByText(WARNING)).toBeTruthy();
    const body = await save();
    expect(body).toHaveProperty('enforceSsoOnly', true);
  });
});
