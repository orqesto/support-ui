import { apiClient } from '@/lib/api-client';
import type { components } from '@/types/generated/api';

/**
 * The custom-API CONFIGURATION surface (CA-5) — admin business, and a different surface from the
 * agent-facing lookup in `customApiLookup.service.ts`.
 *
 * ⛔ THE CREDENTIAL IS WRITE-ONLY AND THAT IS VISIBLE IN THESE TYPES. A connection goes out with a
 * `credential` and comes back with `hasCredential: boolean` and no key at all — not a masked one.
 * A masked `credential: '••••'` would keep the field in the contract, and the next handler that
 * forgets to mask leaks it with no type error and no test change.
 *
 * Shapes are GENERATED from the backend contract. A hand-written copy can disagree with the API
 * silently, which is the class of bug that cost three audit passes on the backend.
 */
export type CustomApiConnection = components['schemas']['CustomApiConnection'];
export type CustomApiEndpoint = components['schemas']['CustomApiEndpoint'];

export interface CreateConnectionInput {
  name: string;
  baseUrl: string;
  purpose?: string | null;
  authType: 'bearer' | 'header' | 'none';
  authHeaderName?: string | null;
  credential?: string;
  headers?: Record<string, string>;
}

/**
 * ⚠️ FE/BE SKEW, as on the lookup service. A push to `main` deploys this frontend while the backend
 * ships on a tag, so this code can meet a backend that predates it. Every field the list renders is
 * given a value here rather than trusted to arrive.
 *
 * ⛔ `hasCredential` defaults to FALSE, never true: claiming a key is set when the backend did not
 * say so would show an admin a configured connection that cannot authenticate.
 */
const normaliseEndpoint = (endpoint: CustomApiEndpoint): CustomApiEndpoint => ({
  ...endpoint,
  fieldPaths: endpoint.fieldPaths ?? [],
  // The CONNECTION's flag wins (S4). An older backend that does not compute this falls back to the
  // endpoint's own flag, which is the closest honest answer available.
  effectivelyEnabled: endpoint.effectivelyEnabled ?? endpoint.enabled,
  chainBroken: endpoint.chainBroken ?? false,
  hasResponseSkeleton: endpoint.hasResponseSkeleton ?? false,
});

const normalise = (connection: CustomApiConnection): CustomApiConnection => ({
  ...connection,
  hasCredential: connection.hasCredential ?? false,
  departmentIds: connection.departmentIds ?? [],
  endpoints: (connection.endpoints ?? []).map(normaliseEndpoint),
});

export const customApiService = {
  async list(): Promise<CustomApiConnection[]> {
    const res = await apiClient.get<{ success: boolean; data: CustomApiConnection[] }>(
      '/custom-apis'
    );
    return (res.data.data ?? []).map(normalise);
  },

  async create(input: CreateConnectionInput): Promise<CustomApiConnection> {
    const res = await apiClient.post<{ success: boolean; data: CustomApiConnection }>(
      '/custom-apis',
      input
    );
    return normalise(res.data.data);
  },

  /**
   * ⛔ THREE-VALUED CREDENTIAL, and the caller must respect it: omit to KEEP the existing key,
   * '' to CLEAR it. Sending '' on every save means renaming an integration silently deletes its
   * key and every lookup starts failing authentication.
   */
  async update(id: number, input: Partial<CreateConnectionInput & { enabled: boolean }>) {
    const res = await apiClient.patch<{ success: boolean; data: CustomApiConnection }>(
      `/custom-apis/${id}`,
      input
    );
    return normalise(res.data.data);
  },

  async remove(id: number): Promise<void> {
    await apiClient.delete(`/custom-apis/${id}`);
  },
};
