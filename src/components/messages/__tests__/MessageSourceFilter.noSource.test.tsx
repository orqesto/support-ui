/**
 * F2: "No source" is offered only where the list's endpoint understands `messageSourceId=none`
 * (the knowledge base). Needs Routing shares this filter and keeps its options as they were.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { installTransport, ok, routeAbsent } from '@/test/apiTransport';

// ReactSelect reads the theme context; the options it is given are what is under test.
vi.mock('@/components/ui/ReactSelect', () => ({
  ReactSelect: ({ options }: { options: Array<{ value: string; label: string }> }) => (
    <ul>
      {options.map((option) => (
        <li key={option.value} data-value={option.value}>
          {option.label}
        </li>
      ))}
    </ul>
  ),
}));

const { MessageSourceFilter } = await import('../MessageSourceFilter');

let wire: ReturnType<typeof installTransport>;
beforeEach(() => {
  wire = installTransport(apiClient, (request) =>
    request.method === 'GET' && request.path === '/api/messages/sources'
      ? ok([{ id: 9, name: 'orders@' }])
      : routeAbsent(request)
  );
});
afterEach(() => {
  cleanup();
  wire.restore();
});

const mount = (includeNoSource?: boolean) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MessageSourceFilter
        value="all"
        onChange={() => undefined}
        includeNoSource={includeNoSource}
      />
    </QueryClientProvider>
  );

const labels = () => screen.getAllByRole('listitem').map((item) => item.textContent);

describe('MessageSourceFilter "No source"', () => {
  it('opted in: All sources, No source (value none), then each mailbox', async () => {
    mount(true);
    await waitFor(() => expect(screen.getByText('orders@')).toBeTruthy());
    expect(labels()).toEqual(['All sources', 'No source', 'orders@']);
    expect(screen.getByText('No source').getAttribute('data-value')).toBe('none');
  });

  it('by default (Needs Routing): no "No source"', async () => {
    mount();
    await waitFor(() => expect(screen.getByText('orders@')).toBeTruthy());
    expect(labels()).toEqual(['All sources', 'orders@']);
  });
});
