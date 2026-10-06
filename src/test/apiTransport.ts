/**
 * Mock the HTTP layer UNDER the real api-client: requests go through every interceptor of
 * `apiClient` (org context header, error reshaping, HTML-page rejection) and only the wire is fake.
 * A test that mocks the service or the client itself cannot see a bug in either — an audit found
 * two HIGH defects hidden exactly that way.
 */
import {
  AxiosError,
  AxiosHeaders,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';

export type WireRequest = {
  method: string;
  /** Path without the base URL and without the query string. */
  path: string;
  params: Record<string, string>;
  body: unknown;
  headers: Record<string, unknown>;
};

export type WireResponse = {
  status: number;
  /** A JSON body, or (with `html`) the page an Express app answers for a route it does not have. */
  data?: unknown;
  html?: boolean;
};

export type WireHandler = (request: WireRequest) => WireResponse | Promise<WireResponse>;

/** Express's answer for a route it does not have: 404 with an HTML page. */
export const routeAbsent = (request: WireRequest): WireResponse => ({
  status: 404,
  html: true,
  data: `<!DOCTYPE html><html><body><pre>Cannot ${request.method} ${request.path}</pre></body></html>`,
});

export const ok = (data: unknown): WireResponse => ({ status: 200, data: { success: true, data } });

const toParams = (config: InternalAxiosRequestConfig): Record<string, string> => {
  const params: Record<string, string> = {};
  const url = new URL(config.url ?? '', 'http://wire.test');
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  for (const [key, value] of Object.entries((config.params ?? {}) as Record<string, unknown>))
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
      params[key] = String(value);
  return params;
};

/**
 * Pass the app's `apiClient` (imported by the TEST, so this helper never names it — the path
 * audit in servicePathsCarryApiPrefix scans every non-test module that does).
 */
export const installTransport = (client: AxiosInstance, handler: WireHandler) => {
  const requests: WireRequest[] = [];
  const original = client.defaults.adapter;
  client.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    const path = new URL(config.url ?? '', 'http://wire.test').pathname;
    const request: WireRequest = {
      method: (config.method ?? 'get').toUpperCase(),
      path,
      params: toParams(config),
      body: typeof config.data === 'string' ? (JSON.parse(config.data) as unknown) : config.data,
      headers: { ...(config.headers as unknown as Record<string, unknown>) },
    };
    requests.push(request);
    const answer = await handler(request);
    const response = {
      data: answer.data,
      status: answer.status,
      statusText: String(answer.status),
      headers: new AxiosHeaders({
        'content-type': answer.html ? 'text/html; charset=utf-8' : 'application/json',
      }),
      config,
      request: {},
    };
    if (answer.status >= 400)
      throw new AxiosError(
        `Request failed with status code ${answer.status}`,
        AxiosError.ERR_BAD_REQUEST,
        config,
        {},
        response
      );
    return response;
  };
  return {
    requests,
    /** Requests matching a method and path. */
    calls: (method: string, path: string | RegExp) =>
      requests.filter(
        (request) =>
          request.method === method &&
          (typeof path === 'string' ? request.path === path : path.test(request.path))
      ),
    restore: () => {
      client.defaults.adapter = original;
    },
  };
};
