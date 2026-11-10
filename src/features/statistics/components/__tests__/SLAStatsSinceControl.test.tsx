/**
 * "Start over" for SLA Performance (owner 2026-11-09): an org admin moves the "count from" date
 * to now; everyone else only sees it. Nothing is deleted — "Count everything" clears it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const state = {
  since: null as string | null,
  isDefault: false,
  admin: true,
  saved: [] as Array<'now' | 'default' | null>,
};
vi.mock('@/features/statistics/services/sla.service', () => ({
  slaService: {
    getStatsSince: () => Promise.resolve({ since: state.since, isDefault: state.isDefault }),
    setStatsSince: (since: 'now' | 'default' | null) => {
      state.saved.push(since);
      return Promise.resolve(
        since === 'now'
          ? { since: '2026-11-09T12:00:00.000Z', isDefault: false }
          : since === 'default'
            ? { since: '2026-11-09T10:00:00.000Z', isDefault: true }
            : { since: null, isDefault: false }
      );
    },
  },
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ isOrgAdmin: state.admin }),
}));

const { SLAStatsSinceControl } = await import('../SLAStatsSinceControl');

const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SLAStatsSinceControl />
    </QueryClientProvider>
  );

afterEach(() => {
  cleanup();
  state.since = null;
  state.isDefault = false;
  state.admin = true;
  state.saved = [];
});

describe('SLAStatsSinceControl', () => {
  it('an admin starts over after confirming; the page then counts from the saved instant', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Start over from now' }));
    expect(state.saved).toEqual([]); // nothing until confirmed
    fireEvent.click(await screen.findByRole('button', { name: 'Start over' }));
    await waitFor(() => expect(state.saved).toEqual(['now']));
    expect(await screen.findByText(/^Counting from /)).toBeTruthy();
  });

  it('a set date offers "Count everything", which clears it', async () => {
    state.since = '2026-11-01T08:00:00.000Z';
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Count everything' }));
    await waitFor(() => expect(state.saved).toEqual([null]));
  });

  it('a non-admin sees the date and no buttons', async () => {
    state.admin = false;
    state.since = '2026-11-01T08:00:00.000Z';
    mount();
    expect(await screen.findByText(/^Counting from /)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('on the default, offers no "Back to default"; after "Count everything" it does', async () => {
    state.since = '2026-11-09T10:00:00.000Z';
    state.isDefault = true;
    mount();
    expect(await screen.findByText(/when exact tracking began/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back to default' })).toBeNull();
    cleanup();
    state.since = null;
    state.isDefault = false;
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Back to default' }));
    await waitFor(() => expect(state.saved).toEqual(['default']));
  });
});
