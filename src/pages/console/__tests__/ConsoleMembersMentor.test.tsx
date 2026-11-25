/**
 * Review 1.1.330 GAP-ALLIANCE: the organisation console's member list marks a mentor (a member who
 * mentors in at least one of the organisation's workspaces) — the backend sends `isMentor` on the
 * row and on each workspace role. An older backend sends neither: no mark, no crash.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { normalizeAllianceMember } from '@/services/alliance-admin.service';

// What the backend sends; the page gets it through the service's own normaliser.
const raw: Array<Record<string, unknown>> = [];

vi.mock('react-router-dom', () => ({ useParams: () => ({ allianceId: '1' }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/useAllianceAdmin', () => ({
  useAllianceMembers: () => ({
    data: raw.map((row) => normalizeAllianceMember(row as never)),
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useAllianceMemberCandidates: () => ({ data: [], isLoading: false }),
  useAddMember: () => ({ mutate: vi.fn(), isPending: false }),
  useChangeMemberRole: () => ({ mutate: vi.fn(), isPending: false }),
  useDeactivateMember: () => ({ mutate: vi.fn(), isPending: false }),
  useReactivateMember: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveMember: () => ({ mutate: vi.fn(), isPending: false }),
}));

const { ConsoleMembers } = await import('@/pages/console/ConsoleMembers');

const member = (userId: number, name: string, extra: Record<string, unknown> = {}) => ({
  userId,
  name,
  email: `${name.toLowerCase()}@example.test`,
  allianceRole: null,
  effectiveRoles: [{ orgId: 4, orgName: 'Northwind', role: 'support' }],
  revokedRoles: [],
  active: true,
  ...extra,
});

const rowOf = (email: string) => screen.getByText(email).closest('tr') as HTMLElement;
const renderPage = (rows: Array<Record<string, unknown>>) => {
  raw.splice(0, raw.length, ...rows);
  return render(
    <ThemeProvider>
      <ConsoleMembers />
    </ThemeProvider>
  );
};

afterEach(cleanup);

describe('ConsoleMembers — the mentor mark', () => {
  it('a mentor’s row carries a Mentor badge', () => {
    renderPage([
      member(30, 'Mona', {
        isMentor: true,
        effectiveRoles: [{ orgId: 4, orgName: 'Northwind', role: 'support', isMentor: true }],
      }),
      member(31, 'Pete', { isMentor: false }),
    ]);
    expect(within(rowOf('mona@example.test')).getByText('Mentor')).toBeInTheDocument();
    // control: a member who mentors nowhere has none
    expect(within(rowOf('pete@example.test')).queryByText('Mentor')).toBeNull();
  });

  it('an older backend (no isMentor anywhere) shows no badge and does not crash', () => {
    renderPage([member(32, 'Olga')]);
    expect(within(rowOf('olga@example.test')).queryByText('Mentor')).toBeNull();
  });
});

describe('normalizeAllianceMember — isMentor', () => {
  it('missing ⇒ false, on the row and on each workspace role', () => {
    const out = normalizeAllianceMember(member(33, 'Ivy') as never);
    expect(out.isMentor).toBe(false);
    expect(out.effectiveRoles.map((role) => role.isMentor)).toEqual([false]);
  });

  it('control: true is kept', () => {
    const out = normalizeAllianceMember(
      member(34, 'Max', {
        isMentor: true,
        effectiveRoles: [{ orgId: 4, orgName: 'Northwind', role: 'support', isMentor: true }],
      }) as never
    );
    expect(out.isMentor).toBe(true);
    expect(out.effectiveRoles[0].isMentor).toBe(true);
  });
});
