import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PLATFORM_SECTIONS } from '@/components/console/consoleSections';
import { legacyRedirectRoutes } from '@/routes/legacyRedirects';

const Where = () => {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}${location.hash}`}</p>;
};

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        {legacyRedirectRoutes()}
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );

describe('legacy addresses after the Organisation / Threads rename', () => {
  it('serves the platform Organisations section at /console/platform/organisations', () => {
    expect(PLATFORM_SECTIONS.find((section) => section.id === 'alliances')?.path).toBe(
      'organisations'
    );
  });

  it.each([
    ['/console/platform/alliances', '/console/platform/organisations'],
    ['/messages/42?tab=ai#reply', '/threads/42?tab=ai#reply'],
    ['/console/alliance/7/members?q=a#x', '/console/organisation/7/members?q=a#x'],
    // The old SLA page now lives in Statistics → Performance; its window carries over.
    ['/sla', '/statistics?days=30#performance'],
    // The old ticket form page: tickets are edited in place now.
    ['/tickets/edit/7?x=1#h', '/tickets/7?x=1#h'],
    ['/sla?days=90', '/statistics?days=90#performance'],
    ['/sla?from=2026-08-03&to=2026-08-09', '/statistics?from=2026-08-03&to=2026-08-09#performance'],
  ])('sends %s to %s', (from, to) => {
    renderAt(from);
    expect(screen.getByTestId('where').textContent).toBe(to);
  });

  it('control: a current address is not redirected', () => {
    renderAt('/threads/42');
    expect(screen.getByTestId('where').textContent).toBe('/threads/42');
  });
});
