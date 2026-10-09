/**
 * "Start from a template" on a connected system (spec CUSTOM-API-TEMPLATES): offered on an empty
 * connection AND on one that already has lookups, and only when the section hands over a handler.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomApiSettings } from '../CustomApiSettings';
import type * as Svc from '@/services/customApi.service';

type Connection = Svc.CustomApiConnection;

const list = vi.fn<() => Promise<Connection[]>>();

vi.mock('@/services/customApi.service', async () => {
  const actual = await vi.importActual<typeof Svc>('@/services/customApi.service');
  return {
    ...actual,
    customApiService: { ...actual.customApiService, list: () => list() },
  };
});

const endpoint = (over: Partial<Connection['endpoints'][number]> = {}) =>
  ({
    id: 20,
    connectionId: 1,
    label: "this customer's orders",
    enabled: true,
    effectivelyEnabled: true,
    chainBroken: false,
    hasResponseSkeleton: true,
    skeletonSource: null,
    dataPath: null,
    fieldPaths: [{ path: 'order_id', label: 'Order', kind: 'plain', role: 'identifier' }],
    ...over,
  }) as Connection['endpoints'][number];

const connection = (over: Partial<Connection> = {}) =>
  ({
    id: 1,
    name: 'Militech',
    baseUrl: 'https://shop.example/index.php',
    enabled: true,
    hasCredential: true,
    scopeMode: 'all',
    departmentIds: [],
    endpoints: [endpoint()],
    ...over,
  }) as Connection;

beforeEach(() => {
  list.mockReset();
});

describe('Start from a template', () => {
  it('is offered on an EMPTY connection and hands that connection over', async () => {
    const empty = connection({ endpoints: [] });
    list.mockResolvedValue([empty]);
    const onStartFromTemplate = vi.fn();
    render(
      <CustomApiSettings
        canManageVendors
        onAddLookup={vi.fn()}
        onStartFromTemplate={onStartFromTemplate}
      />
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Start from a template' }));
    expect(onStartFromTemplate).toHaveBeenCalledWith(empty);
  });

  it('is offered on a connection that already HAS lookups', async () => {
    const withLookups = connection({ id: 2, name: 'Arasaka' });
    list.mockResolvedValue([withLookups]);
    const onStartFromTemplate = vi.fn();
    render(
      <CustomApiSettings
        canManageVendors
        onAddLookup={vi.fn()}
        onStartFromTemplate={onStartFromTemplate}
      />
    );

    await screen.findByText("this customer's orders");
    await userEvent.click(screen.getByRole('button', { name: 'Start from a template' }));
    expect(onStartFromTemplate).toHaveBeenCalledWith(withLookups);
  });

  it('is NOT offered without a handler', async () => {
    list.mockResolvedValue([connection({ endpoints: [] }), connection({ id: 2, name: 'Arasaka' })]);
    render(<CustomApiSettings canManageVendors onAddLookup={vi.fn()} />);

    await screen.findByText('Arasaka');
    expect(screen.getAllByRole('button', { name: 'Add a lookup' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Start from a template' })).toBeNull();
  });
});
