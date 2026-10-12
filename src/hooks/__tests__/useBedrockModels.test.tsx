/**
 * A "no list" answer must not be cached for 30 minutes: opening "Add Bedrock" asks before anything
 * is saved (→ not_configured), and the cached answer used to outlive the save — the picker kept the
 * built-in list and "save this connection" until a page reload.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { BedrockDiscovery } from '@/services/bedrockDiscovery.service';

let answer: BedrockDiscovery = { payload: null, reason: 'not_configured' };
vi.mock('@/services/bedrockDiscovery.service', () => ({
  fetchWorkspaceBedrockModels: () => Promise.resolve(answer),
}));

import { useBedrockModels } from '@/hooks/useBedrockModels';

const wrapperFor = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };

describe('useBedrockModels caching', () => {
  it('treats a no-list answer as stale at once', async () => {
    const client = new QueryClient();
    answer = { payload: null, reason: 'not_configured' };
    const { result } = renderHook(() => useBedrockModels('eu-west-1'), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.data).toEqual(answer));
    expect(result.current.isStale).toBe(true);
  });

  it('keeps a live list fresh (control)', async () => {
    const client = new QueryClient();
    answer = { payload: { models: [], source: 'live', fetchedAt: 'x' } };
    const { result } = renderHook(() => useBedrockModels('eu-west-2'), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.data).toEqual(answer));
    expect(result.current.isStale).toBe(false);
  });
});
