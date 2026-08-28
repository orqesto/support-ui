import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ROUTER_FUTURE } from '@/test/routerFuture';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The guard reads a build-time flag from '@/lib/config' and the caller's global role from
// the auth store. Mock both so each test can pin the flag + role; vi.resetModules + dynamic
// import picks up the mocked values.
const renderAt = async (allianceConsoleEnabled: boolean, role: 'admin' | 'user') => {
  vi.resetModules();
  vi.doMock('@/lib/config', () => ({ ALLIANCE_CONSOLE_ENABLED: allianceConsoleEnabled }));
  vi.doMock('@/stores/authStore', () => ({
    useAuthStore: (selector: (state: { user: { role: string } }) => unknown) =>
      selector({ user: { role } }),
  }));
  const { AllianceConsoleRoute } = await import('../AllianceConsoleRoute');
  return render(
    <MemoryRouter initialEntries={['/console']} future={ROUTER_FUTURE}>
      <Routes>
        <Route
          path="/console"
          element={
            <AllianceConsoleRoute>
              <div>ALLIANCE CONSOLE</div>
            </AllianceConsoleRoute>
          }
        />
        <Route path="/dashboard" element={<div>DASHBOARD</div>} />
      </Routes>
    </MemoryRouter>
  );
};

describe('AllianceConsoleRoute', () => {
  afterEach(() => {
    cleanup();
    vi.doUnmock('@/lib/config');
    vi.doUnmock('@/stores/authStore');
    vi.resetModules();
  });

  it('redirects a non-admin to /dashboard when the flag is off', async () => {
    await renderAt(false, 'user');
    expect(screen.getByText('DASHBOARD')).toBeInTheDocument();
    expect(screen.queryByText('ALLIANCE CONSOLE')).not.toBeInTheDocument();
  });

  it('renders the console for any user when the flag is on', async () => {
    await renderAt(true, 'user');
    expect(screen.getByText('ALLIANCE CONSOLE')).toBeInTheDocument();
    expect(screen.queryByText('DASHBOARD')).not.toBeInTheDocument();
  });

  it('lets a global admin through even when the flag is off (ops: provision/manage alliances)', async () => {
    await renderAt(false, 'admin');
    expect(screen.getByText('ALLIANCE CONSOLE')).toBeInTheDocument();
    expect(screen.queryByText('DASHBOARD')).not.toBeInTheDocument();
  });
});
