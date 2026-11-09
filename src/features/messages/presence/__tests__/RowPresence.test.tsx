import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Profiler, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';
import { usePresenceSummaryStore } from '../presenceSummaryStore';
import { RowPresence } from '../RowPresence';

const getMembers = vi.hoisted(() => vi.fn<() => Promise<unknown[]>>());
vi.mock('@/services/organization.service', () => ({
  organizationService: { getMembers: () => getMembers() },
}));

const MEMBERS = [
  { id: 1, userId: 7, firstName: 'Anna', lastName: 'Kim', email: 'a@x.io' },
  { id: 2, userId: 8, firstName: 'Ben', lastName: 'Ray', email: 'b@x.io' },
  { id: 3, userId: 9, firstName: 'Cleo', lastName: 'Fox', email: 'c@x.io' },
];

let client: QueryClient;
const wrap = (node: ReactNode) =>
  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);

const put = (
  threads: Record<
    string,
    Array<{ userId: number; state: 'viewing' | 'writing_reply' | 'writing_note' | 'away' }>
  >
) =>
  act(() => {
    usePresenceSummaryStore.getState().applySnapshot(threads);
    usePresenceSummaryStore.getState().setAvailable(true);
  });

beforeEach(() => {
  getMembers.mockReset();
  getMembers.mockResolvedValue(MEMBERS);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  usePresenceSummaryStore.getState().reset();
  useAuthStore.setState({ user: { id: 1 } as User, selectedOrganizationId: 1 });
});

describe('RowPresence', () => {
  it('renders nothing while presence is unavailable', () => {
    act(() => {
      usePresenceSummaryStore.getState().applySnapshot({ '10': [{ userId: 7, state: 'viewing' }] });
    });
    const { container } = wrap(<RowPresence conversationId={10} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when nobody is on the thread, and when the only one is me', () => {
    put({ '10': [{ userId: 1, state: 'writing_reply' }] });
    const { container } = wrap(<RowPresence conversationId={10} />);
    expect(container).toBeEmptyDOMElement();
    const other = wrap(<RowPresence conversationId={99} />);
    expect(other.container).toBeEmptyDOMElement();
  });

  it('excludes me from the count', () => {
    put({
      '10': [
        { userId: 1, state: 'viewing' },
        { userId: 7, state: 'viewing' },
      ],
    });
    wrap(<RowPresence conversationId={10} />);
    expect(screen.getByLabelText('1 other agent in this thread')).toBeInTheDocument();
  });

  it('shows the writing variant when anyone else writes a reply, not when they are away', () => {
    put({ '10': [{ userId: 7, state: 'writing_reply' }], '11': [{ userId: 7, state: 'away' }] });
    wrap(
      <>
        <RowPresence conversationId={10} />
        <RowPresence conversationId={11} />
      </>
    );
    const badges = screen.getAllByTestId('row-presence');
    expect(badges[0]).toHaveAttribute('data-variant', 'writing');
    expect(badges[1]).toHaveAttribute('data-variant', 'away');
  });

  it('shows at most two initials and "+n" for the rest, once the names are known', async () => {
    getMembers.mockResolvedValue(MEMBERS);
    await client.prefetchQuery({
      queryKey: ['organization-members', 1],
      queryFn: () => getMembers(),
    });
    getMembers.mockClear();
    put({
      '10': [
        { userId: 7, state: 'viewing' },
        { userId: 8, state: 'viewing' },
        { userId: 9, state: 'viewing' },
      ],
    });
    wrap(<RowPresence conversationId={10} />);
    const badge = screen.getByTestId('row-presence');
    expect(badge).toHaveTextContent('AK');
    expect(badge).toHaveTextContent('BR');
    expect(badge).not.toHaveTextContent('CF');
    expect(badge).toHaveTextContent('+1');
    expect(getMembers).not.toHaveBeenCalled();
  });

  it('does not fetch the member list just to draw a row', () => {
    put({ '10': [{ userId: 7, state: 'viewing' }] });
    wrap(<RowPresence conversationId={10} />);
    expect(screen.getByTestId('row-presence')).toBeInTheDocument();
    expect(getMembers).not.toHaveBeenCalled();
  });

  it('the tooltip lists names and states (fetching the members on hover)', async () => {
    put({
      '10': [
        { userId: 7, state: 'writing_reply' },
        { userId: 8, state: 'away' },
      ],
    });
    wrap(<RowPresence conversationId={10} />);
    fireEvent.mouseEnter(screen.getByTestId('row-presence').parentElement as HTMLElement);
    expect(await screen.findByText('Anna Kim')).toBeInTheDocument();
    expect(screen.getByText('writing a reply…')).toBeInTheDocument();
    expect(screen.getByText('Ben Ray')).toBeInTheDocument();
    expect(screen.getByText('away')).toBeInTheDocument();
    expect(getMembers).toHaveBeenCalledTimes(1);
  });

  it('a change on another thread does not re-render this row', () => {
    put({ '10': [{ userId: 7, state: 'viewing' }], '11': [{ userId: 8, state: 'viewing' }] });
    const onRender = vi.fn();
    wrap(
      <Profiler id="row" onRender={onRender}>
        <RowPresence conversationId={10} />
      </Profiler>
    );
    const before = onRender.mock.calls.length;
    act(() => {
      usePresenceSummaryStore
        .getState()
        .applyChanges([{ conversationId: 11, users: [{ userId: 8, state: 'writing_reply' }] }]);
    });
    expect(onRender.mock.calls.length).toBe(before);
  });
});
