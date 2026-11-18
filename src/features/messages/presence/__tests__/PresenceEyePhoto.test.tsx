/**
 * The presence list ("who is on this thread") shows each teammate's profile photo in their
 * circle, from the key the members list sends.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { userPhotoUrl } from '@/components/ui/UserPhoto';
import { PresenceEye } from '../PresenceEye';

const getMembers = vi.hoisted(() => vi.fn<() => Promise<unknown[]>>());
vi.mock('../../services/presenceMembers.service', () => ({
  presenceMembersService: { list: () => getMembers() },
}));

const wrap = (node: ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
};

beforeEach(() => {
  useAuthStore.setState({ selectedOrganizationId: 1 });
  getMembers.mockResolvedValue([
    { id: 7, firstName: 'Anna', lastName: 'Kim', photoKey: 'k-anna' },
    { id: 8, firstName: 'Ben', lastName: null, photoKey: null },
  ]);
});
afterEach(cleanup);

describe('PresenceEye — photos', () => {
  it('shows the photo of a viewer who has one, initials for one who has none', async () => {
    const since = new Date().toISOString();
    wrap(
      <PresenceEye
        available
        viewers={[
          { userId: 7, state: 'viewing', since },
          { userId: 8, state: 'viewing', since },
        ]}
        isPhone={false}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    await screen.findByText('Anna Kim');
    const srcs = [...document.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(srcs).toEqual([userPhotoUrl('k-anna')]);
    expect(screen.getByText('B')).toBeTruthy();
  });
});
