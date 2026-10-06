/** `useDepartments({ includeInactive })` asks for soft-deleted departments through the real client. */
import { afterEach, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { installTransport, ok } from '@/test/apiTransport';
import { useDepartments } from '../useDepartments';

let wire: ReturnType<typeof installTransport> | null = null;
afterEach(() => wire?.restore());

const run = (options?: { includeInactive?: boolean }) => {
  wire = installTransport(apiClient, () => ok([{ id: 9, name: 'Old desk', active: false }]));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useDepartments(options), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
};

describe('useDepartments includeInactive', () => {
  it('asks for inactive departments when told to', async () => {
    const { result } = run({ includeInactive: true });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(wire?.calls('GET', '/api/departments')[0]?.params).toEqual({ includeInactive: 'true' });
  });

  it('asks for active ones only by default', async () => {
    const { result } = run();
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(wire?.calls('GET', '/api/departments')[0]?.params).toEqual({});
  });
});
