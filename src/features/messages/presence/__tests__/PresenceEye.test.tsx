import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { PresenceEye } from '../PresenceEye';
import type { PresenceViewer } from '../presence.types';

const members = vi.hoisted(() => ({ list: [] as unknown[] }));
const getMembers = vi.hoisted(() => vi.fn<() => Promise<unknown[]>>());
vi.mock('../../services/presenceMembers.service', () => ({
  presenceMembersService: { list: () => getMembers() },
}));

const NOW = Date.parse('2026-11-09T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const viewer = (
  userId: number,
  state: PresenceViewer['state'],
  sinceMs = 5 * 60_000
): PresenceViewer => ({ userId, state, since: ago(sinceMs) });

const wrap = (node: ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
};

beforeEach(() => {
  getMembers.mockReset();
  useAuthStore.setState({ selectedOrganizationId: 1 });
  getMembers.mockImplementation(() => Promise.resolve(members.list));
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  members.list = [
    { id: 7, firstName: 'Anna', lastName: 'Kim' },
    { id: 8, firstName: 'Ben', lastName: null },
  ];
});
afterEach(() => vi.useRealTimers());

describe('PresenceEye', () => {
  it('renders nothing when presence is unavailable', () => {
    const { container } = wrap(
      <PresenceEye available={false} viewers={[viewer(7, 'viewing')]} isPhone={false} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing with zero viewers and no cap note', () => {
    const { container } = wrap(<PresenceEye available viewers={[]} isPhone={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the count and an aria-label', () => {
    wrap(
      <PresenceEye
        available
        viewers={[viewer(7, 'viewing'), viewer(8, 'viewing')]}
        isPhone={false}
      />
    );
    const button = screen.getByRole('button', { name: '2 other agents in this thread' });
    expect(button).toHaveTextContent('2');
  });

  it('uses the singular for one agent', () => {
    wrap(<PresenceEye available viewers={[viewer(7, 'viewing')]} isPhone={false} />);
    expect(screen.getByRole('button', { name: '1 other agent in this thread' })).toBeTruthy();
  });

  it('uses the warning style when someone writes a reply, and lists "writing a reply…"', async () => {
    wrap(
      <PresenceEye
        available
        viewers={[viewer(7, 'writing_reply'), viewer(8, 'viewing')]}
        isPhone={false}
      />
    );
    const button = screen.getByRole('button', { name: /other agents in this thread/ });
    expect(button.className).toContain('text-warning');
    fireEvent.click(button);
    expect(await screen.findByText('writing a reply…')).toBeTruthy();
  });

  it('does not use the warning style when nobody writes a reply', () => {
    wrap(<PresenceEye available viewers={[viewer(7, 'writing_note')]} isPhone={false} />);
    expect(screen.getByRole('button').className).not.toContain('text-warning');
  });

  it('orders reply, note, viewing, away, then by name; greys away and names states', async () => {
    wrap(
      <PresenceEye
        available
        viewers={[
          viewer(8, 'away'),
          viewer(7, 'viewing'),
          { userId: 9, state: 'writing_note', since: ago(1000) },
        ]}
        isPhone={false}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    await screen.findByText('Anna Kim');
    const rows = screen.getAllByRole('listitem');
    expect(rows.map((row) => row.getAttribute('data-state'))).toEqual([
      'writing_note',
      'viewing',
      'away',
    ]);
    expect(rows[2].className).toContain('opacity-');
    expect(rows[2]).toHaveTextContent('away');
    expect(rows[0]).toHaveTextContent('writing a note');
  });

  it('shows an unknown agent as "Another agent" with ?', async () => {
    wrap(<PresenceEye available viewers={[viewer(99, 'viewing')]} isPhone={false} />);
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByText('Another agent')).toBeTruthy();
    expect(screen.getByText('?')).toBeTruthy();
  });

  it('derives "since N min" and "just now"', async () => {
    wrap(
      <PresenceEye
        available
        viewers={[viewer(7, 'viewing', 3 * 60_000 + 5000), viewer(8, 'viewing', 20_000)]}
        isPhone={false}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByText('since 3 min')).toBeTruthy();
    expect(screen.getByText('just now')).toBeTruthy();
  });

  it('shows the cap note with the list', async () => {
    wrap(
      <PresenceEye
        available
        viewers={[viewer(7, 'viewing')]}
        isPhone={false}
        capNote="presence for the latest 50 of 70 threads"
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByText('presence for the latest 50 of 70 threads')).toBeTruthy();
  });

  it('when capped, shows the eye with only the cap note and no count', () => {
    wrap(
      <PresenceEye
        available={false}
        capped
        viewers={[]}
        isPhone={false}
        capNote="presence for the latest 50 of 70 threads"
      />
    );
    const button = screen.getByRole('button', { name: 'presence for the latest 50 of 70 threads' });
    expect(button).not.toHaveTextContent(/\d/);
    fireEvent.click(button);
    expect(screen.getByText('presence for the latest 50 of 70 threads')).toBeTruthy();
  });

  it('opens a bottom sheet on a phone and closes it from the scrim', async () => {
    wrap(<PresenceEye available viewers={[viewer(7, 'viewing')]} isPhone />);
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByTestId('presence-sheet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('presence-sheet')).toBeNull();
  });

  it('a workspace switch refetches the members: org A names never show in org B', async () => {
    const orgA = [{ id: 7, firstName: 'Anna', lastName: 'Kim' }];
    const orgB = [{ id: 7, firstName: 'Zoe', lastName: 'Lee' }];
    getMembers.mockImplementation(() =>
      Promise.resolve(useAuthStore.getState().selectedOrganizationId === 1 ? orgA : orgB)
    );
    wrap(<PresenceEye available viewers={[viewer(7, 'viewing')]} isPhone={false} />);
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByText('Anna Kim')).toBeTruthy();
    act(() => {
      useAuthStore.setState({ selectedOrganizationId: 2 });
    });
    expect(await screen.findByText('Zoe Lee')).toBeTruthy();
    expect(screen.queryByText('Anna Kim')).toBeNull();
    expect(getMembers).toHaveBeenCalledTimes(2);
  });

  it('asks for no members while no workspace is selected', async () => {
    useAuthStore.setState({ selectedOrganizationId: null });
    wrap(<PresenceEye available viewers={[viewer(7, 'viewing')]} isPhone={false} />);
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByText('Another agent')).toBeTruthy();
    expect(getMembers).not.toHaveBeenCalled();
  });
});
