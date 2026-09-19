/**
 * A JSON call answered by the SPA's index.html (200 text/html) must fail loudly instead of
 * reaching the screen as an empty list. Staging: `GET /custom-apis` (no `/api`) rendered
 * "Nothing connected yet" with no error.
 */
import { describe, expect, it } from 'vitest';
import { AxiosHeaders, type AxiosResponse } from 'axios';
import { HTML_RESPONSE_CODE, noteSessionFromResponse } from '@/lib/api-client';
import { apiErrorMessage } from '@/lib/apiError';
import { getErrorStatus } from '@/lib/errorMessages';

const respond = (
  status: number,
  contentType: string | undefined,
  data: unknown,
  responseType?: string
): AxiosResponse => {
  const headers = new AxiosHeaders();
  if (contentType) headers.set('Content-Type', contentType);
  return {
    data,
    status,
    statusText: '',
    headers,
    config: { url: '/custom-apis', responseType, headers: new AxiosHeaders() },
  } as AxiosResponse;
};

const INDEX_HTML = '<!doctype html><html><body><div id="root"></div></body></html>';

describe('api-client rejects an HTML page on a JSON call', () => {
  it('rejects a 200 text/html JSON call with a recognisable, displayable error', () => {
    let caught: unknown;
    try {
      noteSessionFromResponse(respond(200, 'text/html', INDEX_HTML));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as { code?: string }).code).toBe(HTML_RESPONSE_CODE);
    expect((caught as Error).name).toBe('HtmlResponseError');
    expect(getErrorStatus(caught)).toBe(200);
    expect(apiErrorMessage(caught, 'fallback')).toMatch(/web page instead of data/);
    expect(apiErrorMessage(caught, 'fallback')).toContain('/custom-apis');
    // The same check runs on saves (POST/PUT/DELETE), so the words must not claim a screen
    // failed to load — "the request did not complete" is true of a load and a save alike.
    expect(apiErrorMessage(caught, 'fallback')).toContain('request did not complete');
    expect(apiErrorMessage(caught, 'fallback')).not.toMatch(/screen/i);
  });

  it('rejects the charset variant text/html; charset=utf-8', () => {
    expect(() =>
      noteSessionFromResponse(respond(200, 'text/html; charset=utf-8', INDEX_HTML))
    ).toThrow(/web page instead of data/);
  });

  it('rejects a mixed-case Text/HTML (header values are case-insensitive)', () => {
    expect(() => noteSessionFromResponse(respond(200, 'Text/HTML', INDEX_HTML))).toThrow(
      /web page instead of data/
    );
  });

  it("passes responseType 'text' whose Content-Type is text/html (EmailTemplatesPage)", () => {
    expect(noteSessionFromResponse(respond(200, 'text/html', INDEX_HTML, 'text')).data).toBe(
      INDEX_HTML
    );
  });

  it('passes a blob download whose Content-Type is text/html', () => {
    const blob = new Blob([INDEX_HTML], { type: 'text/html' });
    expect(noteSessionFromResponse(respond(200, 'text/html', blob, 'blob')).data).toBe(blob);
  });

  it('passes a JSON 200', () => {
    const body = { data: [{ id: 1 }] };
    expect(
      noteSessionFromResponse(respond(200, 'application/json; charset=utf-8', body)).data
    ).toBe(body);
  });

  it('passes a 204 with no Content-Type', () => {
    expect(noteSessionFromResponse(respond(204, undefined, '')).status).toBe(204);
  });
});
