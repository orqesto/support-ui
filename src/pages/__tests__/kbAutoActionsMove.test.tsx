/**
 * Automatic actions moved to Settings › AI (owner decision 2026-10-22). Old links and bookmarks to
 * `/knowledge-base/automatic` land on the section, and the Knowledge Base page's button goes there.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const overviewCall = vi.hoisted(() => ({ getOverview: vi.fn() }));
vi.mock('@/services/kbAutoActions.service', () => ({ kbAutoActionsService: overviewCall }));

const { kbSubRoutes } = await import('../kbConsolidationRoutes');
const { KbAutoActionsButton } = await import('@/components/kb/autoActions/KbAutoActionsButton');
const { resetAutoActionsAvailability } = await import('@/hooks/useAutoActionsAvailable');

const Where = () => {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname + loc.hash}</div>;
};

beforeEach(() => {
  resetAutoActionsAvailability();
  overviewCall.getOverview.mockReset();
  overviewCall.getOverview.mockResolvedValue({});
});
afterEach(cleanup);

describe('Automatic actions lives in Settings › AI', () => {
  it('the old page address redirects to the section', async () => {
    render(
      <MemoryRouter initialEntries={['/knowledge-base/automatic']}>
        <Routes>
          {kbSubRoutes()}
          <Route path="/settings" element={<Where />} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByTestId('where')).toHaveTextContent(
      /^\/settings#ai\/automatic-actions$/
    );
  });

  it('the Knowledge Base button lands on the section', async () => {
    render(
      <MemoryRouter initialEntries={['/knowledge-base']}>
        <Routes>
          <Route path="/knowledge-base" element={<KbAutoActionsButton />} />
          <Route path="/settings" element={<Where />} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Automatic actions' }));
    expect(await screen.findByTestId('where')).toHaveTextContent(
      /^\/settings#ai\/automatic-actions$/
    );
  });

  it('the button is not drawn on a backend without the routes, where the section is hidden', async () => {
    overviewCall.getOverview.mockRejectedValue(
      Object.assign(new Error('Request failed'), { status: 404, data: '<pre>Cannot GET</pre>' })
    );
    render(
      <MemoryRouter>
        <KbAutoActionsButton />
      </MemoryRouter>
    );
    await vi.waitFor(() => expect(overviewCall.getOverview).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole('button', { name: 'Automatic actions' })).not.toBeInTheDocument();
  });
});
