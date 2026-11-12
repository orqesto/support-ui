import { describe, expect, it, vi } from 'vitest';
import {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { contextPartOf, withThreadContextBatching } from '../threadContextBatch';

const config = (
  url: string,
  extra: Partial<InternalAxiosRequestConfig> = {},
  headers: Record<string, string> = { 'X-Organization-Context': '7' }
): InternalAxiosRequestConfig => ({
  url,
  method: 'get',
  headers: new AxiosHeaders(headers),
  ...extra,
});

const ok = (cfg: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse => ({
  data,
  status,
  statusText: String(status),
  headers: new AxiosHeaders(),
  config: cfg,
  request: {},
});

/** A transport answering the composite route from `parts`, and every single route by its url. */
const transport = (parts: Record<string, { status: number; body: unknown }>) =>
  vi.fn<AxiosAdapter>((cfg) => {
    if (cfg.url?.endsWith('/context')) {
      const asked = String((cfg.params as { parts: string }).parts).split(',');
      return Promise.resolve(
        ok(cfg, {
          success: true,
          data: { parts: Object.fromEntries(asked.map((name) => [name, parts[name]])) },
        })
      );
    }
    return Promise.resolve(ok(cfg, { alone: cfg.url }));
  });

const FIVE = [
  '/api/labels/messages/102',
  '/api/messages/102/tickets',
  '/api/messages/102/merges',
  '/api/messages/102/participants',
  '/api/messages/102/kb-references',
];

describe('contextPartOf', () => {
  it('names the five side reads, and nothing else', () => {
    expect(FIVE.map((url) => contextPartOf(config(url))?.part)).toEqual([
      'labels',
      'tickets',
      'merges',
      'participants',
      'kbReferences',
    ]);
    expect(contextPartOf(config('/api/messages/102/notes'))).toBeNull();
    expect(contextPartOf(config('/api/messages/102/merges', { method: 'post' }))).toBeNull();
    expect(contextPartOf(config('/api/messages/102/merges', { params: { a: 1 } }))).toBeNull();
  });
});

describe('withThreadContextBatching', () => {
  const answers = {
    labels: { status: 200, body: { success: true, data: ['vip'] } },
    tickets: { status: 404, body: { success: false, error: 'Thread not found' } },
    merges: { status: 200, body: { success: true, data: { merges: [] } } },
    participants: { status: 200, body: { success: true, data: { participants: [] } } },
    kbReferences: { status: 200, body: { success: true, data: [] } },
  };

  it('one render’s five reads of a thread go out as ONE request, each answered as its route', async () => {
    const next = transport(answers);
    const adapter = withThreadContextBatching(next);
    const results = await Promise.allSettled(FIVE.map((url) => adapter(config(url))));
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].url).toBe('/api/messages/102/context');
    expect((results[0] as PromiseFulfilledResult<AxiosResponse>).value.data).toEqual(
      answers.labels.body
    );
    // A refusal is the error axios gives for that status, with the route's own body.
    const refused = (results[1] as PromiseRejectedResult).reason as AxiosError;
    expect(refused).toBeInstanceOf(AxiosError);
    expect(refused.response?.status).toBe(404);
    expect(refused.response?.data).toEqual(answers.tickets.body);
    // The composite carried the scoping headers of the asks.
    expect(AxiosHeaders.from(next.mock.calls[0][0].headers).get('X-Organization-Context')).toBe(
      '7'
    );
  });

  it('a read on its own (a refresh) goes out as it always did', async () => {
    const next = transport(answers);
    const response = await withThreadContextBatching(next)(config(FIVE[2]));
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].url).toBe(FIVE[2]);
    expect(response.data).toEqual({ alone: FIVE[2] });
  });

  it('never folds reads of different threads or scopes into one', async () => {
    const next = transport(answers);
    const adapter = withThreadContextBatching(next);
    await Promise.all([
      adapter(config('/api/messages/102/merges')),
      adapter(config('/api/messages/103/merges')),
      adapter(config('/api/messages/102/participants', {}, { 'X-Organization-Context': '8' })),
    ]);
    expect(next.mock.calls.map(([cfg]) => cfg.url)).toEqual([
      '/api/messages/102/merges',
      '/api/messages/103/merges',
      '/api/messages/102/participants',
    ]);
  });

  it('an older backend without the route: every read goes out alone, and folding stops', async () => {
    const next = vi.fn<AxiosAdapter>((cfg) =>
      cfg.url?.endsWith('/context')
        ? Promise.reject(
            new AxiosError('nope', AxiosError.ERR_BAD_REQUEST, cfg, {}, ok(cfg, {}, 404))
          )
        : Promise.resolve(ok(cfg, { alone: cfg.url }))
    );
    const adapter = withThreadContextBatching(next);
    const first = await Promise.all(FIVE.slice(0, 2).map((url) => adapter(config(url))));
    expect(first.map((response) => response.data as unknown)).toEqual([
      { alone: FIVE[0] },
      { alone: FIVE[1] },
    ]);
    next.mockClear();
    await Promise.all(FIVE.slice(0, 2).map((url) => adapter(config(url))));
    expect(next.mock.calls.map(([cfg]) => cfg.url)).toEqual(FIVE.slice(0, 2));
  });

  it('a composite that fails otherwise (network, 401): every read goes out alone, folding stays on', async () => {
    let failOnce = true;
    const next = vi.fn<AxiosAdapter>((cfg) => {
      if (cfg.url?.endsWith('/context') && failOnce) {
        failOnce = false;
        return Promise.reject(new AxiosError('Network Error', AxiosError.ERR_NETWORK, cfg));
      }
      return transport(answers)(cfg);
    });
    const adapter = withThreadContextBatching(next);
    await Promise.allSettled(FIVE.slice(2).map((url) => adapter(config(url))));
    expect(next).toHaveBeenCalledTimes(4); // the composite, then three alone
    next.mockClear();
    await Promise.allSettled(FIVE.slice(2).map((url) => adapter(config(url))));
    expect(next).toHaveBeenCalledTimes(1);
  });
});
