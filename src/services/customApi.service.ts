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
  /**
   * D42. ⛔ REQUIRED, and `true` is the only value the backend accepts — a create without it is a
   * 400. Typed as the literal rather than `boolean` so a call site cannot pass `false` and get a
   * refusal at runtime that the compiler could have caught.
   */
  piiAcknowledged: true;
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
  /**
   * ⛔ NULL, never a guess. This frontend can reach production before the backend that added the
   * column does (a push to `main` deploys; the backend ships on a tag), and an older API sends
   * neither field. `null` is the honest reading — "we do not know which route proved this shape" —
   * and it keeps the plain badge. Defaulting to `'sample'` would put a warning on every existing
   * lookup in every workspace; defaulting to `'test'` would re-assert the overstatement being
   * fixed. Both are claims the data does not support.
   */
  skeletonSource: endpoint.skeletonSource ?? null,
  dataPath: endpoint.dataPath ?? null,
});

const normalise = (connection: CustomApiConnection): CustomApiConnection => ({
  ...connection,
  hasCredential: connection.hasCredential ?? false,
  /**
   * ⛔ NULL, never a stand-in date. A deployed frontend can meet a backend that predates the
   * column, and defaulting it to "now" or to the connection's createdAt would render a consent
   * nobody gave — the one thing this field exists to be honest about.
   */
  piiAcknowledgedAt: connection.piiAcknowledgedAt ?? null,
  piiAcknowledgedBy: connection.piiAcknowledgedBy ?? null,
  departmentIds: connection.departmentIds ?? [],
  endpoints: (connection.endpoints ?? []).map(normaliseEndpoint),
});

/**
 * What the Send test and the paste route both return. ⛔ The TREE IS BUILT FROM `paths`, not from
 * the skeleton: `paths` is the list the backend derived row-relative, and it is exactly what the
 * executor resolves against each row. Rebuilding the tree from a hand-copied `Skeleton` type here
 * would be a second interpretation of the vendor's shape in a third place — the same divergence
 * that made a pasted tree offer `data[].order_id` while the live path reads `order_id`.
 */
export interface EndpointTestResult {
  outcome: {
    status: 'ok' | 'no_match' | 'shape_changed' | 'failed';
    /**
     * `shape_changed` only. WITH `missingKind`: for `records` this is where the record list was
     * looked for; for `fields` these are the configured fields that vanished. Absent from an older
     * backend, which is "unspecified" — never assumed to be `fields`.
     */
    missing?: string[];
    missingKind?: 'records' | 'fields';
    reason?: string;
    rows?: unknown[];
    /** The vendor's own `x-total-count`. Absent means "we do not know", never zero. */
    total?: number | null;
  };
  paths: string[];
}

export interface FieldPick {
  path: string;
  label: string;
  kind: 'plain' | 'money';
  role: 'none' | 'identifier' | 'date' | 'status' | 'total' | 'currency';
  currencyPath?: string;
  currencyLiteral?: string;
}

const normaliseTestResult = (data: unknown): EndpointTestResult => {
  const shaped = (data ?? {}) as Partial<EndpointTestResult>;
  return {
    // ⛔ An absent outcome is a FAILURE, never an ok with no rows: a lookup that silently reads as
    // working is how an admin stops looking at the thing that is broken.
    outcome: shaped.outcome ?? { status: 'failed', reason: 'No response from the server.' },
    paths: shaped.paths ?? [],
  };
};

export const customApiService = {
  async list(): Promise<CustomApiConnection[]> {
    const res = await apiClient.get<{ success: boolean; data: CustomApiConnection[] }>(
      '/api/custom-apis'
    );
    return (res.data.data ?? []).map(normalise);
  },

  async create(input: CreateConnectionInput): Promise<CustomApiConnection> {
    const res = await apiClient.post<{ success: boolean; data: CustomApiConnection }>(
      '/api/custom-apis',
      input
    );
    return normalise(res.data.data);
  },

  /**
   * ⛔ THREE-VALUED CREDENTIAL, and the caller must respect it: omit to KEEP the existing key,
   * '' to CLEAR it. Sending '' on every save means renaming an integration silently deletes its
   * key and every lookup starts failing authentication.
   */
  async update(
    id: number,
    /**
     * ⛔ `piiAcknowledged` is OMITTED here, not merely optional (D42). The backend's update schema
     * does not carry it, and typing it out makes the rule unbreakable from this side: an edit
     * neither re-asks nor re-stamps, so the recorded date stays the date of the DECISION rather
     * than the date of the last rename.
     */
    input: Partial<Omit<CreateConnectionInput, 'piiAcknowledged'> & { enabled: boolean }>
  ) {
    const res = await apiClient.patch<{ success: boolean; data: CustomApiConnection }>(
      `/api/custom-apis/${id}`,
      input
    );
    return normalise(res.data.data);
  },

  async remove(id: number): Promise<void> {
    await apiClient.delete(`/api/custom-apis/${id}`);
  },

  async createEndpoint(connectionId: number, input: Record<string, unknown>) {
    const res = await apiClient.post<{ success: boolean; data: CustomApiConnection }>(
      `/api/custom-apis/${connectionId}/endpoints`,
      input
    );
    return normalise(res.data.data);
  },

  async updateEndpoint(connectionId: number, endpointId: number, input: Record<string, unknown>) {
    const res = await apiClient.patch<{ success: boolean; data: CustomApiConnection }>(
      `/api/custom-apis/${connectionId}/endpoints/${endpointId}`,
      input
    );
    return normalise(res.data.data);
  },

  /** Calls the vendor once. Needs our servers to reach them — see `shapeSample` when they cannot. */
  async sendTest(
    connectionId: number,
    endpointId: number,
    parameter?: string
  ): Promise<EndpointTestResult> {
    const res = await apiClient.post<{ success: boolean; data: unknown }>(
      `/api/custom-apis/${connectionId}/endpoints/${endpointId}/test`,
      parameter ? { parameter } : {}
    );
    return normaliseTestResult(res.data.data);
  },

  /**
   * D39: the same tree from a response the admin PASTED, for a system behind a VPN, an IP
   * allowlist, or a tunnel that has died. The backend shares the executor's reading, so this
   * returns the same paths the live call would.
   */
  async shapeSample(
    connectionId: number,
    endpointId: number,
    sample: string
  ): Promise<EndpointTestResult> {
    const res = await apiClient.post<{ success: boolean; data: unknown }>(
      `/api/custom-apis/${connectionId}/endpoints/${endpointId}/shape`,
      { sample }
    );
    return normaliseTestResult(res.data.data);
  },
};
