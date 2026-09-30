/**
 * F3/§7 (KB consolidation #873): the Cases page hides behind `ui.kb_cases`. The FE reaches
 * production on merge while the backend ships on a tag — without the gate, a Cases page calling
 * routes that do not exist yet would be live.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

let flagOn = false;
vi.mock('@/hooks/useUiFlags', () => ({
  useUiFlags: () => ({
    isSurfaceVisibleToMe: (key: string) => key === 'ui.kb_cases' && flagOn,
    isPreviewing: () => false,
    loading: false,
  }),
}));
vi.mock('@/components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../KbCasesPage', () => ({ KbCasesPage: () => <p>CASES PAGE</p> }));
vi.mock('@/components/common/FeatureUnavailable', () => ({
  FeatureUnavailable: () => <p>NOT AVAILABLE</p>,
}));

const { KbCasesRoute } = await import('../kbConsolidationRoutes');

afterEach(cleanup);

describe('Cases page flag gate', () => {
  it('is hidden while ui.kb_cases is off', () => {
    flagOn = false;
    render(
      <MemoryRouter>
        <KbCasesRoute />
      </MemoryRouter>
    );
    expect(screen.getByText('NOT AVAILABLE')).toBeInTheDocument();
    expect(screen.queryByText('CASES PAGE')).not.toBeInTheDocument();
  });

  it('renders once the flag is on', async () => {
    flagOn = true;
    render(
      <MemoryRouter>
        <KbCasesRoute />
      </MemoryRouter>
    );
    expect(await screen.findByText('CASES PAGE')).toBeInTheDocument();
  });
});
