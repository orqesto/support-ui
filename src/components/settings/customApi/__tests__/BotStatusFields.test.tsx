import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BLOCKER_TEXT, botStatusBlockers } from '../BotStatusFields';
import { EndpointWizard } from '../EndpointWizard';
import type * as Svc from '@/features/custom-api';

/**
 * ODL-25 (2026-11-05): the per-lookup switch "the Telegram bot may answer the order status". It
 * has to reach the save, name what the lookup still lacks, and stay hidden on an older backend.
 */
type Connection = Svc.CustomApiConnection;
type Endpoint = Svc.CustomApiEndpoint;

const updateEndpoint =
  vi.fn<(connectionId: number, endpointId: number, input: unknown) => Promise<Connection>>();

vi.mock('@/features/custom-api/services/customApi.service', async () => {
  const actual = await vi.importActual<typeof Svc>(
    '@/features/custom-api/services/customApi.service'
  );
  return {
    ...actual,
    customApiService: {
      ...actual.customApiService,
      updateEndpoint: (connectionId: number, endpointId: number, input: unknown) =>
        updateEndpoint(connectionId, endpointId, input),
    },
  };
});
vi.mock('@/features/custom-api/hooks/useCustomApiLookup', () => ({
  useInvalidateCustomApiAvailability: () => () => undefined,
}));

const READY_FIELDS: Endpoint['fieldPaths'] = [
  { path: 'order_id', label: 'Order', kind: 'plain', role: 'identifier' },
  { path: 'order_status', label: 'Status', kind: 'plain', role: 'status' },
];

const stored = (over: Partial<Endpoint> = {}): Endpoint => ({
  id: 99,
  connectionId: 1,
  label: 'Order by number',
  path: '/rest/order/{value}',
  method: 'GET',
  parameterSource: 'manual',
  identityField: null,
  sourceEndpointId: null,
  sourceFieldPath: null,
  ownershipSourceEndpointId: null,
  noMatchHint: null,
  recordFormatPrefix: null,
  recordFormatLength: 5,
  recordFormatCharset: 'digits',
  headers: {},
  requestBodyTemplate: null,
  fieldPaths: READY_FIELDS,
  resultShape: 'one',
  rowCap: 25,
  surface: 'both',
  category: 'order',
  statusLabels: {},
  seenStatuses: [],
  enabled: true,
  effectivelyEnabled: true,
  chainBroken: false,
  hasResponseSkeleton: true,
  skeletonSource: 'test',
  dataPath: null,
  templateKey: null,
  botAnswersStatus: false,
  botStatusReply: null,
  botNotFoundReply: null,
  createdAt: '2026-11-05T10:00:00.000Z',
  updatedAt: '2026-11-05T10:00:00.000Z',
  ...over,
});

const connection = (endpoint: Endpoint): Connection => ({
  id: 1,
  name: 'Shop',
  purpose: null,
  baseUrl: 'https://shop.example/index.php',
  enabled: true,
  authType: 'none',
  authHeaderName: null,
  hasCredential: false,
  headers: {},
  timeoutMs: 10000,
  scopeMode: 'all',
  piiAcknowledgedBy: 7,
  piiAcknowledgedAt: '2026-11-05T10:00:00.000Z',
  departmentIds: [],
  endpoints: [endpoint],
  createdAt: '2026-11-05T10:00:00.000Z',
  updatedAt: '2026-11-05T10:00:00.000Z',
});

const open = (endpoint: Endpoint) =>
  render(
    <EndpointWizard
      connection={connection(endpoint)}
      endpoint={endpoint}
      onClose={() => undefined}
      onSaved={() => undefined}
    />
  );

const SWITCH = /The Telegram bot may answer the order status/i;

beforeEach(() => {
  updateEndpoint.mockReset();
  updateEndpoint.mockImplementation((_c, _e) => Promise.resolve(connection(stored())));
});

describe('botStatusBlockers — what the bot still needs', () => {
  it('a lookup with a typed number, a format, an identifier and a status needs nothing', () => {
    expect(botStatusBlockers(stored())).toEqual([]);
  });

  it('names each missing piece', () => {
    expect(
      botStatusBlockers(
        stored({ parameterSource: 'identity', recordFormatLength: null, fieldPaths: [] })
      )
    ).toEqual(['not_manual', 'no_format', 'no_identifier', 'no_status']);
  });
});

describe('the switch on the lookup', () => {
  it('turning it on and writing a wording reaches the save', async () => {
    const user = userEvent.setup();
    open(stored());
    await user.click(screen.getByRole('switch', { name: SWITCH }));
    await user.type(screen.getByLabelText(/Reply with the status/i), 'Order {{order}: {{status}');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateEndpoint).toHaveBeenCalledTimes(1));
    // RED: leave bot.payload out of useAgentWords ⇒ the switch is drawn and never saved.
    expect(updateEndpoint.mock.calls[0]?.[2]).toMatchObject({
      botAnswersStatus: true,
      botStatusReply: 'Order {order}: {status}',
      botNotFoundReply: null,
    });
  });

  it('CONTROL: left alone, it saves OFF', async () => {
    const user = userEvent.setup();
    open(stored());
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateEndpoint).toHaveBeenCalledTimes(1));
    expect(updateEndpoint.mock.calls[0]?.[2]).toMatchObject({ botAnswersStatus: false });
  });

  it('switched on for a lookup that cannot answer, it says what is missing', () => {
    open(stored({ botAnswersStatus: true, fieldPaths: [READY_FIELDS[0]] }));
    expect(screen.getByText(BLOCKER_TEXT.no_status)).toBeInTheDocument();
    expect(screen.queryByText(BLOCKER_TEXT.no_identifier)).not.toBeInTheDocument();
  });

  it('an older backend (no switch in the lookup) shows no switch', () => {
    const {
      botAnswersStatus: _on,
      botStatusReply: _reply,
      botNotFoundReply: _missing,
      ...older
    } = stored();
    open(older as Endpoint);
    expect(screen.queryByRole('switch', { name: SWITCH })).not.toBeInTheDocument();
  });
});
