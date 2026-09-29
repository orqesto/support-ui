import type { CustomApiConnection, CustomApiEndpoint } from '@/services/customApi.service';
import type { components } from '@/types/generated/api';

/**
 * The "Advanced" settings of a vendor and of a lookup (2026-09-29): how a request is shaped, and
 * how the vendor's answer is judged. ⛔ Every default is what the product did before these
 * settings existed, so a lookup nobody touches is sent exactly as before — and so the form can show
 * a one-line summary of only what DIFFERS.
 *
 * ⛔ VERSION SKEW (FE CLAUDE.md): this build can meet a backend without the fields. Every reader
 * falls back to the default, and `supportsFlexibleRequests` hides the section entirely — an admin
 * must never edit settings that an older backend silently drops on save.
 */

export const METHODS = ['GET', 'POST'] as const;
export const BODY_FORMATS = ['json', 'form'] as const;
export const NOT_FOUND_MEANS = ['no_match', 'failed'] as const;
export const PAGINATION_MODES = ['none', 'page', 'offset', 'cursor', 'link'] as const;
export const MAX_PAGES = 20;

export type Method = (typeof METHODS)[number];
export type BodyFormat = (typeof BODY_FORMATS)[number];
export type NotFoundMeans = (typeof NOT_FOUND_MEANS)[number];
export type PaginationMode = (typeof PAGINATION_MODES)[number];

/**
 * ⛔ THE LISTS ABOVE ARE COPIES of the API's enums, so they are checked against the generated types
 * in BOTH directions: a value the API gains (or loses) fails `type-check` here instead of becoming
 * an option the form cannot offer, or one the API refuses (the #789 lesson, frontend half).
 */
type Generated = components['schemas']['CustomApiEndpoint'];
type SameSet<Left, Right> = [Exclude<Left, Right>, Exclude<Right, Left>] extends [never, never]
  ? true
  : false;
const listsMatchTheApi: [
  SameSet<BodyFormat, Generated['bodyFormat']>,
  SameSet<NotFoundMeans, Generated['notFoundMeans']>,
  SameSet<PaginationMode, Generated['paginationMode']>,
] = [true, true, true];
void listsMatchTheApi;

export interface RequestSettings {
  method: Method;
  bodyFormat: BodyFormat;
  requestBodyTemplate: string;
  notFoundMeans: NotFoundMeans;
  limitParam: string;
  paginationMode: PaginationMode;
  paginationParam: string;
  paginationStart: number;
  paginationNextPath: string;
  paginationMaxPages: number;
}

export const DEFAULT_REQUEST_SETTINGS: RequestSettings = {
  method: 'GET',
  bodyFormat: 'json',
  requestBodyTemplate: '',
  notFoundMeans: 'no_match',
  limitParam: 'limit',
  paginationMode: 'none',
  paginationParam: '',
  paginationStart: 1,
  paginationNextPath: '',
  paginationMaxPages: 5,
};

const oneOf = <T extends string>(list: readonly T[], value: unknown, fallback: T): T =>
  list.includes(value as T) ? (value as T) : fallback;

/** Does the backend this page talks to know these settings at all? */
export const supportsFlexibleRequests = (connection: CustomApiConnection): boolean =>
  'failureStatusPath' in (connection as object);

export const readRequestSettings = (endpoint?: CustomApiEndpoint): RequestSettings => {
  if (!endpoint) return { ...DEFAULT_REQUEST_SETTINGS };
  const raw = endpoint as Partial<Record<keyof RequestSettings, unknown>> & { method?: string };
  return {
    method: oneOf(METHODS, raw.method, 'GET'),
    bodyFormat: oneOf(BODY_FORMATS, raw.bodyFormat, 'json'),
    requestBodyTemplate: typeof raw.requestBodyTemplate === 'string' ? raw.requestBodyTemplate : '',
    notFoundMeans: oneOf(NOT_FOUND_MEANS, raw.notFoundMeans, 'no_match'),
    // ⛔ '' is a real setting ("send no limit"), so only a MISSING value falls back.
    limitParam: typeof raw.limitParam === 'string' ? raw.limitParam : 'limit',
    paginationMode: oneOf(PAGINATION_MODES, raw.paginationMode, 'none'),
    paginationParam: typeof raw.paginationParam === 'string' ? raw.paginationParam : '',
    paginationStart: typeof raw.paginationStart === 'number' ? raw.paginationStart : 1,
    paginationNextPath: typeof raw.paginationNextPath === 'string' ? raw.paginationNextPath : '',
    paginationMaxPages: typeof raw.paginationMaxPages === 'number' ? raw.paginationMaxPages : 5,
  };
};

/**
 * What a save sends. ⛔ Used by EVERY write the wizard makes — the create, the update behind Test,
 * and the Save — because a field added to one payload and not another is saved on one path and
 * silently dropped on the other (the L2 lesson in EndpointWizard).
 * A single-record lookup never pages, so its mode is sent as `none` whatever the form last held:
 * the API refuses pagination on one, and the admin cannot see the hidden control to fix it.
 */
export const requestSettingsPayload = (
  settings: RequestSettings,
  resultShape: 'one' | 'many'
): Record<string, unknown> => ({
  method: settings.method,
  bodyFormat: settings.bodyFormat,
  requestBodyTemplate: settings.requestBodyTemplate.trim() ? settings.requestBodyTemplate : null,
  notFoundMeans: settings.notFoundMeans,
  limitParam: settings.limitParam.trim(),
  paginationMode: resultShape === 'many' ? settings.paginationMode : 'none',
  paginationParam: settings.paginationParam.trim() || null,
  paginationStart: settings.paginationStart,
  paginationNextPath: settings.paginationNextPath.trim() || null,
  paginationMaxPages: settings.paginationMaxPages,
});

const PAGINATION_WORDS: Record<PaginationMode, string> = {
  none: 'one page',
  page: 'follows page numbers',
  offset: 'follows offsets',
  cursor: 'follows the next cursor',
  link: 'follows the next-page link',
};

/** Only what differs from the defaults, in words — empty when nothing does. */
export const describeRequestSettings = (
  settings: RequestSettings,
  resultShape: 'one' | 'many'
): string[] => {
  const parts: string[] = [];
  if (settings.method === 'POST') {
    parts.push(settings.bodyFormat === 'form' ? 'POST with a form body' : 'POST with a JSON body');
  }
  if (settings.notFoundMeans === 'failed') parts.push('404 is an error');
  if (resultShape === 'many') {
    if (settings.limitParam.trim() === '') parts.push('no limit sent');
    else if (settings.limitParam.trim() !== 'limit')
      parts.push(`limit sent as “${settings.limitParam.trim()}”`);
    if (settings.paginationMode !== 'none') parts.push(PAGINATION_WORDS[settings.paginationMode]);
  }
  return parts;
};

/** What stops a save, in words the admin can act on — the API's own rules, checked first. */
export const requestSettingsProblem = (
  settings: RequestSettings,
  resultShape: 'one' | 'many'
): string | null => {
  if (
    settings.method === 'POST' &&
    settings.bodyFormat === 'json' &&
    settings.requestBodyTemplate.trim()
  ) {
    try {
      JSON.parse(settings.requestBodyTemplate);
    } catch {
      return 'The request body is not valid JSON. Put {value} inside quotes ("{value}").';
    }
  }
  if (resultShape !== 'many' || settings.paginationMode === 'none') return null;
  const pageInBody = settings.method === 'POST' && settings.requestBodyTemplate.includes('{page}');
  if (
    (settings.paginationMode === 'page' || settings.paginationMode === 'offset') &&
    !settings.paginationParam.trim() &&
    !pageInBody
  ) {
    return `Name the ${settings.paginationMode === 'page' ? 'page' : 'offset'} parameter, or put "{page}" in the request body.`;
  }
  if (settings.paginationMode === 'cursor' && !settings.paginationNextPath.trim()) {
    return 'Say where the next cursor (or next-page link) is in the response.';
  }
  return null;
};

// ── the vendor's failure words ────────────────────────────────────────────────

export interface FailureSettings {
  failureStatusPath: string;
  /** Edited as one comma-separated line. */
  failureStatusValues: string;
  failureMessagePath: string;
}

export const DEFAULT_FAILURE_SETTINGS: FailureSettings = {
  failureStatusPath: 'success',
  failureStatusValues: '0, false',
  failureMessagePath: 'error',
};

export const readFailureSettings = (connection?: CustomApiConnection): FailureSettings => {
  if (!connection) return { ...DEFAULT_FAILURE_SETTINGS };
  const raw = connection as Partial<{
    failureStatusPath: unknown;
    failureStatusValues: unknown;
    failureMessagePath: unknown;
  }>;
  return {
    failureStatusPath:
      typeof raw.failureStatusPath === 'string'
        ? raw.failureStatusPath
        : DEFAULT_FAILURE_SETTINGS.failureStatusPath,
    failureStatusValues: Array.isArray(raw.failureStatusValues)
      ? raw.failureStatusValues.filter((value) => typeof value === 'string').join(', ')
      : DEFAULT_FAILURE_SETTINGS.failureStatusValues,
    failureMessagePath:
      typeof raw.failureMessagePath === 'string'
        ? raw.failureMessagePath
        : DEFAULT_FAILURE_SETTINGS.failureMessagePath,
  };
};

export const failureSettingsPayload = (settings: FailureSettings): Record<string, unknown> => ({
  failureStatusPath: settings.failureStatusPath.trim(),
  failureStatusValues: settings.failureStatusValues
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  failureMessagePath: settings.failureMessagePath.trim(),
});

const sameValues = (left: string, right: string) =>
  left
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .join(',') ===
  right
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .join(',');

export const describeFailureSettings = (settings: FailureSettings): string[] => {
  const parts: string[] = [];
  const status = settings.failureStatusPath.trim();
  if (
    status !== 'success' ||
    !sameValues(settings.failureStatusValues, DEFAULT_FAILURE_SETTINGS.failureStatusValues)
  ) {
    parts.push(
      status
        ? `fails when “${status}” is ${settings.failureStatusValues || '—'}`
        : 'no status field'
    );
  }
  const message = settings.failureMessagePath.trim();
  if (message !== 'error') parts.push(message ? `error text in “${message}”` : 'no error field');
  return parts;
};
