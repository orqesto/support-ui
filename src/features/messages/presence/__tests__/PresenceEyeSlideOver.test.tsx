import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { PresenceEye } from '../PresenceEye';
import { DetailSlideOver } from '../../components/messagesPage/DetailPanels';
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


/**
 * The z-layer a Tailwind class gives an element: `z-50` → 50, `z-[60]` → 60, none → 0. jsdom does
 * not apply Tailwind, so the stacking is read from the classes the browser would apply.
 */
const zOf = (el: Element | null): number => {
  const match = /(?:^|\s)z-(?:\[(\d+)\]|(\d+))(?:\s|$)/.exec(el?.className ?? '');
  return match ? Number(match[1] ?? match[2]) : 0;
};

/** The nearest ancestor (or the element) that sets a z-layer: its stacking level on the page. */
const layerOf = (el: Element | null): number => {
  for (let node = el; node; node = node.parentElement) {
    const layer = zOf(node);
    if (layer > 0) return layer;
  }
  return 0;
};

const eye = <PresenceEye available isPhone={false} viewers={[viewer(7, 'viewing')]} />;

describe('PresenceEye inside the inbox slide-over (bug 2026-11-09)', () => {
  it('opens a viewer list that stacks ABOVE the slide-over, not behind it', async () => {
    wrap(<DetailSlideOver detail={<header>{eye}</header>} onBackdropClick={() => {}} />);
    const button = screen.getByRole('button', { name: '1 other agent in this thread' });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const panel = await screen.findByRole('dialog', { name: '1 other agent in this thread' });
    expect(await screen.findByText('Anna Kim')).toBeInTheDocument();
    // The popover is portalled to <body>; the slide-over is a fixed layer. Unless the popover's
    // layer is higher, the browser paints it under the panel and the agent sees nothing.
    expect(layerOf(panel)).toBeGreaterThan(layerOf(button));
  });

  it('full-page control: the same eye opens its list with the name', async () => {
    wrap(<main>{eye}</main>);
    const button = screen.getByRole('button', { name: '1 other agent in this thread' });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const panel = await screen.findByRole('dialog', { name: '1 other agent in this thread' });
    expect(await screen.findByText('Anna Kim')).toBeInTheDocument();
    expect(layerOf(panel)).toBeGreaterThan(layerOf(button));
  });
});
