/**
 * The threads page's filter options are read once for the page, not once per component.
 *
 * The filter bar and the table header both call useFilterOptions; the header mounts once the list
 * arrives, so every open of the threads page asked for the message sources and the received-at
 * addresses twice — the latter ~1 s each on a large workspace (staging, 2026-10-30). Over the REAL
 * api-client; only the wire is fake.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { installTransport, ok, routeAbsent, type WireHandler } from '@/test/apiTransport';
import { messageService } from '@/services/message.service';
import { getMessageSourceOptions } from '@/services/messageSourceOptions.service';

let handler: WireHandler = routeAbsent;
let wire: ReturnType<typeof installTransport>;
beforeEach(() => {
  handler = routeAbsent;
  wire = installTransport(apiClient, (request) => handler(request));
});
afterEach(() => wire.restore());

const countGets = (path: string) => {
  const seen = { count: 0 };
  return {
    seen,
    handler: ((request) => {
      if (request.method.toLowerCase() === 'get' && request.path === path) seen.count += 1;
      if (path.endsWith('received-at-options')) {
        return ok([{ address: 'help@shop.example', ours: true, count: 3 }]);
      }
      return ok([{ id: 1, name: 'Help desk', type: 'email', active: true }]);
    }) as WireHandler,
  };
};

describe('received-at options', () => {
  it('two callers on one page ask once', async () => {
    const probe = countGets('/api/messages/received-at-options');
    handler = probe.handler;
    const [first, second] = await Promise.all([
      messageService.getReceivedAtOptions(),
      messageService.getReceivedAtOptions(),
    ]);
    await messageService.getReceivedAtOptions();
    expect(probe.seen.count).toBe(1);
    expect(first).toEqual(second);
    expect(first[0]?.address).toBe('help@shop.example');
  });

  it('a failed read is not kept: it reads as no options, and the next caller asks again', async () => {
    let calls = 0;
    handler = () => {
      calls += 1;
      return calls === 1
        ? { status: 500, data: { success: false, error: 'boom' } }
        : ok([{ address: 'help@shop.example', ours: true, count: 3 }]);
    };
    expect(await messageService.getReceivedAtOptions()).toEqual([]);
    expect((await messageService.getReceivedAtOptions())[0]?.address).toBe('help@shop.example');
    expect(calls).toBe(2);
  });
});

describe('message source options', () => {
  it('two callers ask once; a write under /api/integrations clears it', async () => {
    const probe = countGets('/api/integrations/message-sources');
    handler = probe.handler;
    await Promise.all([getMessageSourceOptions(), getMessageSourceOptions()]);
    expect(probe.seen.count).toBe(1);
    await apiClient.post('/api/integrations', {});
    await getMessageSourceOptions();
    expect(probe.seen.count).toBe(2);
  });
});
