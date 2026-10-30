import { invalidateSharedFetchPrefix, sharedFetch } from '@/lib/sharedFetch';
import { useAuthStore } from '@/stores/authStore';
import { useDepartmentContextStore } from '@/stores/departmentContextStore';

/**
 * Workspace settings that every thread open asked for again — lead config, the workspace, the
 * custom-API lookup options and availability, categories, labels, assignable users: seven of the
 * twenty requests opening a thread sent (staging, 2026-10-29), although none of them changes
 * between threads. Here one request per scope is shared and its answer reused for a minute.
 *
 * The key carries everything the answer depends on — user, workspace and the department
 * selection the API client sends as `X-Department-Context` — so a cached answer is never served
 * to another scope. A write the user makes clears the lookup (`invalidateScopedLookup`).
 */
export const SCOPED_LOOKUP_TTL_MS = 60_000;

export type ScopedLookupName =
  | 'org-current'
  | 'lead-config'
  | 'custom-api-options'
  | 'custom-api-availability'
  | 'categories'
  | 'labels'
  | 'assignable-users'
  | 'reply-templates'
  | 'message-sources'
  | 'received-at-options';

const prefixOf = (name: ScopedLookupName) => `scoped:${name}|`;

const scopeOf = (): string => {
  const auth = useAuthStore.getState();
  const userId = auth.user?.id ?? 'anon';
  const orgId = auth.selectedOrganizationId ?? 'none';
  const depts =
    useDepartmentContextStore.getState()._selectedByKey[`${userId}:${orgId}`]?.join(',') ?? '';
  return `${userId}|${orgId}|${depts}`;
};

export const scopedLookup = <T>(
  name: ScopedLookupName,
  fetcher: () => Promise<T>,
  ...args: Array<string | number | undefined>
): Promise<T> =>
  sharedFetch(
    `${prefixOf(name)}${scopeOf()}|${args.map((arg) => String(arg ?? '')).join('|')}`,
    fetcher,
    SCOPED_LOOKUP_TTL_MS
  );

/** After a change the user made: the next read asks the server again, in every scope. */
export const invalidateScopedLookup = (...names: ScopedLookupName[]): void => {
  for (const name of names) invalidateSharedFetchPrefix(prefixOf(name));
};

/**
 * Which lookups a successful write invalidates, by the URL it went to. Kept here, in one place,
 * rather than in each of the dozens of write methods: a new settings endpoint under the same
 * path clears the right lookup without anyone remembering to.
 */
const WRITE_CLEARS: Array<[RegExp, ScopedLookupName[]]> = [
  [/^\/api\/(organizations|admin|console)(\/|$)/, ['org-current', 'lead-config']],
  [/^\/api\/labels(\/|$)/, ['labels']],
  [/^\/api\/settings\/categories(\/|$)/, ['categories']],
  [/^\/api\/custom-apis(\/|$)/, ['custom-api-options', 'custom-api-availability']],
  [/^\/api\/(users|departments|teams|skills|user-skills)(\/|$)/, ['assignable-users']],
  [/^\/api\/reply-templates(\/|$)/, ['reply-templates']],
  [/^\/api\/integrations(\/|$)/, ['message-sources']],
];

const READ_METHODS = new Set(['get', 'head', 'options']);

/** Called on every successful response (api-client): clears what a write there changed. */
export const clearScopedLookupsAfterWrite = (method?: string, url?: string): void => {
  if (!url || READ_METHODS.has((method ?? 'get').toLowerCase())) return;
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  for (const [pattern, names] of WRITE_CLEARS) {
    if (pattern.test(path)) invalidateScopedLookup(...names);
  }
};
