import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DatabaseBanner, databaseBannerContent } from '../DatabaseBanner';
import { ROUTER_FUTURE } from '@/test/routerFuture';
import { useAuthStore } from '@/stores/authStore';
import { useDatabaseStatusStore } from '@/stores/databaseStatusStore';
import { useOnboardingStore } from '@/stores/onboardingStore';
import type { DatabaseDisplay } from '@/services/database.service';

vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ hasPermission: () => true }) }));

const display = (over: Partial<DatabaseDisplay> = {}): DatabaseDisplay => ({
  mode: 'managed',
  source: 'platform',
  hostMasked: null,
  provenance: null,
  region: null,
  status: 'active',
  schemaVersion: null,
  verifiedAt: null,
  provisionedAt: null,
  sharedRetentionUntil: null,
  updatedAt: '2026-09-07T00:00:00.000Z',
  move: null,
  ...over,
});

const DAY = 86_400_000;
const now = Date.parse('2026-09-07T12:00:00.000Z');

afterEach(() => {
  cleanup();
  useDatabaseStatusStore.getState().clear();
});

describe('databaseBannerContent', () => {
  it('says nothing for an entitled workspace on the managed database', () => {
    expect(databaseBannerContent(null, display(), now)).toBeNull();
  });

  it('says nothing for a healthy own database', () => {
    expect(databaseBannerContent(null, display({ mode: 'own', status: 'active' }), now)).toBeNull();
  });

  // Free = own database: the deadline is a deletion notice and must be visible from day one.
  it('counts down the Free-on-managed retention deadline and turns red in the last week', () => {
    const far = databaseBannerContent(null, display({ sharedRetentionUntil: new Date(now + 40 * DAY).toISOString() }), now);
    expect(far?.tone).toBe('warning');
    expect(far?.text).toMatch(/40 days left/);
    expect(far?.actionable).toBe(true);

    const near = databaseBannerContent(null, display({ sharedRetentionUntil: new Date(now + 3 * DAY).toISOString() }), now);
    expect(near?.tone).toBe('danger');
    expect(near?.text).toMatch(/3 days left/);
  });

  it('reports an own database that stopped answering, from the registry or from a live 503', () => {
    expect(databaseBannerContent(null, display({ mode: 'own', status: 'degraded' }), now)?.tone).toBe('danger');
    // The live pause wins even when the registry still says active.
    expect(databaseBannerContent('DB_UNREACHABLE', display({ mode: 'own', status: 'active' }), now)?.text).toMatch(
      /isn't answering/
    );
  });

  it('explains a move in progress as a pause, not an outage', () => {
    const moving = display({
      mode: 'own',
      status: 'provisioning',
      move: { id: 1, status: 'copying', totalRows: 100, copiedRows: 40, error: null, startedAt: null, finishedAt: null, cleanedAt: null },
    });
    expect(databaseBannerContent(null, moving, now)).toMatchObject({ tone: 'info' });
    expect(databaseBannerContent('DB_PROVISIONING', null, now)).toMatchObject({ tone: 'info' });
  });

  it('does not call a failed move a pause — the workspace is back on the managed database', () => {
    const failed = display({
      mode: 'own',
      status: 'provisioning',
      move: { id: 1, status: 'failed', totalRows: 100, copiedRows: 40, error: 'x', startedAt: null, finishedAt: null, cleanedAt: null },
    });
    expect(databaseBannerContent(null, failed, now)).toBeNull();
  });
});

describe('DatabaseBanner', () => {
  it('renders the deadline from the shared onboarding fetch with a link to the settings', () => {
    useAuthStore.setState({ selectedOrganizationId: 5 });
    useOnboardingStore.setState({
      fetchedForOrg: 5,
      database: { managedAllowed: false, current: display({ sharedRetentionUntil: new Date(Date.now() + 20 * DAY).toISOString() }) },
    });
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <DatabaseBanner />
      </MemoryRouter>
    );
    expect(screen.getByTestId('database-banner')).toHaveTextContent(/Free runs on your own Postgres/);
    expect(screen.getByRole('link', { name: /database settings/i })).toHaveAttribute('href', '/settings#integrations/database');
  });
});
