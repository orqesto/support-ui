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
  ])('sends %s to %s', (from, to) => {
    renderAt(from);
    expect(screen.getByTestId('where').textContent).toBe(to);
  });

  it('control: a current address is not redirected', () => {
    renderAt('/threads/42');
    expect(screen.getByTestId('where').textContent).toBe('/threads/42');
  });
});
