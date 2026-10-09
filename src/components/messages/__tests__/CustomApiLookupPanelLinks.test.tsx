import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { CustomApiLookupPanel } from '../CustomApiLookupPanel';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';

/**
 * The panel's two links (staging, 2026-10-09): "Look up another email" and "Open the full records
 * page" were two inline buttons loose in one block, and rendered as one run of text —
 * "…another emailOpen the full…". jsdom computes no layout, so this pins the cause: each link in
 * a wrapper of its own.
 */
const availability = vi.fn<(surface: string) => Promise<boolean>>();
vi.mock('@/services/customApiLookup.service', () => ({
  customApiLookupService: {
    run: vi.fn(),
    availability: (surface: string) => availability(surface),
  },
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  </MemoryRouter>
);

beforeEach(() => {
  availability.mockReset();
  availability.mockResolvedValue(true);
  useAuthStore.setState({ selectedOrganizationId: 1, user: { id: 9 } as User });
});

describe('CustomApiLookupPanel — the links stack on their own lines', () => {
  it('each link sits in a wrapper of its own, not loose in the panel root', async () => {
    render(<CustomApiLookupPanel conversationId={1} />, { wrapper });
    const another = await screen.findByRole('button', { name: 'Look up another email' });
    const records = screen.getByRole('button', { name: 'Open the full records page' });
    const root = screen.getByRole('group', { name: 'Connected systems' });
    expect(another.parentElement).not.toBe(root);
    expect(records.parentElement).not.toBe(root);
    expect(another.parentElement).not.toBe(records.parentElement);
    expect(another.parentElement?.tagName).toBe('DIV');
    expect(records.parentElement?.tagName).toBe('DIV');
  });

  it('CONTROL: on a contact the records link is a link, and also in its own wrapper', async () => {
    render(<CustomApiLookupPanel contactId={7} />, { wrapper });
    const records = await screen.findByRole('link', { name: 'Open the full records page' });
    const root = screen.getByRole('group', { name: 'Connected systems' });
    expect(records.parentElement).not.toBe(root);
  });
});
