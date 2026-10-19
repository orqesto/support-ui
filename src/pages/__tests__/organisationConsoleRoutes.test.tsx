/**
 * The organisation console moved from `/console/alliance/:id` to `/console/organisation/:id`.
 * Old bookmarks, shared links and `?from=` back links must land on the same console page —
 * same id, same section, same query string and hash — not on a 404 or the console root.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { ROUTER_FUTURE } from '@/test/routerFuture';
import {
  LEGACY_ROUTE,
  LegacyAllianceConsoleRedirect,
  ROUTE,
  isOrganisationConsolePath,
  organisationConsolePath,
} from '@/pages/organisationConsoleRoutes';

const Landed = () => {
  const { pathname, search, hash } = useLocation();
  const { allianceId } = useParams();
  return <p data-testid="landed">{`${pathname}${search}${hash} id=${allianceId}`}</p>;
};

const renderAt = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]} future={ROUTER_FUTURE}>
      <Routes>
        <Route path={LEGACY_ROUTE} element={<LegacyAllianceConsoleRedirect />} />
        <Route path={ROUTE} element={<Landed />}>
          <Route path="*" element={null} />
        </Route>
        <Route path="*" element={<p data-testid="landed">unmatched</p>} />
      </Routes>
    </MemoryRouter>
  );

describe('legacy alliance console redirect', () => {
  it('moves the bare console address, keeping the id', () => {
    renderAt('/console/alliance/7');
    expect(screen.getByTestId('landed').textContent).toBe('/console/organisation/7 id=7');
  });

  it('keeps the section sub-path, query string and hash', () => {
    renderAt('/console/alliance/12/members/extra?tab=groups&q=a%20b#row-3');
    expect(screen.getByTestId('landed').textContent).toBe(
      '/console/organisation/12/members/extra?tab=groups&q=a%20b#row-3 id=12'
    );
  });

  it('CONTROL: the new address renders directly, without the redirect', () => {
    renderAt('/console/organisation/5/identity');
    expect(screen.getByTestId('landed').textContent).toBe('/console/organisation/5/identity id=5');
  });
});

describe('organisation console paths', () => {
  it('builds the new address', () => {
    expect(organisationConsolePath(3)).toBe('/console/organisation/3');
  });

  it('recognises both the new and the legacy address as an organisation console', () => {
    expect(isOrganisationConsolePath('/console/organisation/3/organizations')).toBe(true);
    expect(isOrganisationConsolePath('/console/alliance/3/organizations')).toBe(true);
    expect(isOrganisationConsolePath('/console/platform/organizations')).toBe(false);
  });
});
