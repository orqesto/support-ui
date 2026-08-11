import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The guard reads a build-time constant from '@/lib/config'. Mock the module so each
// test can pin the flag; vi.resetModules + dynamic import picks up the mocked value.
const renderAt = async (allianceConsoleEnabled: boolean) => {
  vi.resetModules();
  vi.doMock('@/lib/config', () => ({ ALLIANCE_CONSOLE_ENABLED: allianceConsoleEnabled }));
  const { AllianceConsoleRoute } = await import('../AllianceConsoleRoute');
  return render(
    <MemoryRouter initialEntries={['/console']}>
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
    vi.resetModules();
  });

  it('redirects a hand-typed /console to /dashboard when the flag is off', async () => {
    await renderAt(false);
    expect(screen.getByText('DASHBOARD')).toBeInTheDocument();
    expect(screen.queryByText('ALLIANCE CONSOLE')).not.toBeInTheDocument();
  });

  it('renders the console when the flag is on', async () => {
    await renderAt(true);
    expect(screen.getByText('ALLIANCE CONSOLE')).toBeInTheDocument();
    expect(screen.queryByText('DASHBOARD')).not.toBeInTheDocument();
  });
});
