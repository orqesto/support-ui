/**
 * The SLA breach list names a website visitor who left no email "Website visitor (no email)" on
 * the row's From line, never by the placeholder the backend stores.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const get = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({ apiClient: { get: (...args: unknown[]) => get(...args) } }));

const { SLABreachList } = await import('../SLABreachList');

const breach = (id: number, sender: string) => ({
  id,
  type: 'message',
  channel: 'chat',
  priority: 'low',
  sender,
  subject: `Subject ${id}`,
  breachAmount: 10,
  createdAt: '2026-11-01T10:00:00Z',
});

describe('SLA breach list and a website visitor with no email', () => {
  it('names the visitor; a real address stays (CONTROL)', async () => {
    get.mockResolvedValue({
      data: {
        total: 2,
        breaches: [breach(1, 'anonymous@chat-widget.local'), breach(2, 'ada@example.com')],
      },
    });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <SLABreachList days={30} />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(await screen.findByText('From: Website visitor (no email)')).toBeInTheDocument();
    expect(screen.getByText('From: ada@example.com')).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('chat-widget.local');
  });
});
