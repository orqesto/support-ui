import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CustomApiTemplate } from '@/services/customApiTemplates.service';

const definition = {
  version: 1,
  lookups: [
    {
      key: 'orders',
      label: 'Orders',
      description: '',
      category: 'order',
      parameterSource: 'identity',
      surface: 'both',
      resultShape: 'many',
      checklist: [],
      statusWords: {},
      ownershipFrom: null,
    },
  ],
} as unknown as CustomApiTemplate['definition'];
const tpl = (over: Partial<CustomApiTemplate> = {}): CustomApiTemplate => ({
  id: 1,
  key: 'order_tracking',
  name: 'Order tracking',
  description: 'Orders by email',
  status: 'published',
  definition,
  updatedAt: '2026-10-09T10:00:00Z',
  ...over,
});
const list = vi.fn(() => Promise.resolve([tpl()]));
const update = vi.fn((id: number, patch: object) => Promise.resolve(tpl({ id, ...patch })));
const create = vi.fn((input: object) => Promise.resolve(tpl({ id: 2, ...input })));
vi.mock('@/services/customApiTemplates.service', () => ({
  customApiTemplateAdminService: {
    list: () => list(),
    update: (id: number, patch: object) => update(id, patch),
    create: (input: object) => create(input),
  },
}));

const { PlatformCustomApiTemplates } = await import('../PlatformCustomApiTemplates');
const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PlatformCustomApiTemplates />
    </QueryClientProvider>
  );

afterEach(cleanup);
beforeEach(() => {
  list.mockClear();
  update.mockClear();
  create.mockClear();
});

describe('Platform Console — Custom API templates', () => {
  it('lists templates with their status', async () => {
    renderPage();
    const row = (await screen.findByText('Order tracking')).closest('li')!;
    expect(within(row).getByText('Published')).toBeInTheDocument();
    expect(within(row).getByText('order_tracking')).toBeInTheDocument();
  });

  it('unpublish sends status draft', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Unpublish' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(1, { status: 'draft' }));
  });

  it('⛔ invalid JSON is refused in the editor — nothing is sent', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Definition (JSON)'), { target: { value: '{ nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The definition is not valid JSON');
    expect(update).not.toHaveBeenCalled();
  });

  it('⛔ the backend’s validation message is shown as is', async () => {
    update.mockRejectedValueOnce(
      Object.assign(
        new Error(
          'definition.lookups.0.ownershipFrom: ownershipFrom "x" names no lookup in this template'
        ),
        { status: 400 }
      )
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('names no lookup in this template');
  });

  it('new template: key, name and definition are sent as a draft', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'New template' }));
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'parcel_tracking' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Parcel tracking' } });
    fireEvent.change(screen.getByLabelText('Definition (JSON)'), {
      target: { value: JSON.stringify(definition) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        key: 'parcel_tracking',
        name: 'Parcel tracking',
        description: '',
        status: 'draft',
        definition,
      })
    );
  });

  it('locks the form while a save is pending', async () => {
    update.mockImplementationOnce(() => new Promise(() => {}));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(screen.getByLabelText('Definition (JSON)')).toBeDisabled();
    expect(screen.getByLabelText('Name')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'New template' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
  });

  it('cancel clears a shown error', async () => {
    update.mockRejectedValueOnce(Object.assign(new Error('boom: bad definition'), { status: 400 }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
