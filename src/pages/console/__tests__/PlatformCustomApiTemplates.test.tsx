import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  AdminCustomApiTemplate,
  CustomApiTemplate,
} from '@/services/customApiTemplates.service';
import { apiError } from '@/test/apiError';

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
/** A row whose stored definition no longer parses (C2): the stored JSON as is, plus why. */
const broken = (over: Partial<AdminCustomApiTemplate> = {}): AdminCustomApiTemplate => ({
  ...tpl({ id: 3, key: 'parcel_tracking', name: 'Parcel tracking', status: 'draft' }),
  definition: { version: 1, lookups: 'not-a-list' },
  definitionError: 'definition.lookups: Expected array, received string',
  ...over,
});
const list = vi.fn((): Promise<AdminCustomApiTemplate[]> => Promise.resolve([tpl()]));
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
    // F5: the REAL interceptor's error, not a hand-made object.
    const err = await apiError(400, {
      success: false,
      error:
        'definition.lookups.0.ownershipFrom: ownershipFrom "x" names no lookup in this template',
    });
    update.mockRejectedValueOnce(err);
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
    const err = await apiError(400, { success: false, error: 'boom: bad definition' });
    update.mockRejectedValueOnce(err);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Platform Console — list states (F5)', () => {
  it('an empty list says so', async () => {
    list.mockImplementationOnce(() => Promise.resolve([]));
    renderPage();
    expect(await screen.findByText('No templates yet.')).toBeInTheDocument();
  });

  it('a failed load says so, and Retry loads again', async () => {
    const err = await apiError(503, { success: false, error: 'down' });
    list.mockRejectedValueOnce(err);
    renderPage();
    expect(await screen.findByText('Failed to load templates.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Order tracking')).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('⛔ a refused Publish shows the server’s message (C3 422)', async () => {
    list.mockImplementationOnce(() => Promise.resolve([tpl({ status: 'draft' })]));
    const message =
      'This template’s stored definition is broken (definition.lookups: Required). Fix the definition before publishing.';
    const err = await apiError(422, { success: false, error: message });
    update.mockRejectedValueOnce(err);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Publish' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });
});

describe('Platform Console — a template whose stored definition is broken (F2)', () => {
  it('shows the row with a warning naming the problem', async () => {
    list.mockImplementationOnce(() => Promise.resolve([tpl(), broken()]));
    renderPage();
    const row = (await screen.findByText('Parcel tracking')).closest('li')!;
    expect(row).toHaveTextContent(
      'The stored definition is broken: definition.lookups: Expected array, received string. Fix the JSON and save.'
    );
    const healthy = screen.getByText('Order tracking').closest('li')!;
    expect(healthy).not.toHaveTextContent('stored definition is broken');
  });

  it('Edit opens the raw stored JSON, and Save sends it back as the repair', async () => {
    list.mockImplementationOnce(() => Promise.resolve([broken()]));
    renderPage();
    const row = (await screen.findByText('Parcel tracking')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));
    const box = screen.getByLabelText<HTMLTextAreaElement>('Definition (JSON)');
    expect(JSON.parse(box.value)).toEqual({ version: 1, lookups: 'not-a-list' });
    fireEvent.change(box, { target: { value: JSON.stringify(definition) } });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(3, {
        name: 'Parcel tracking',
        description: 'Orders by email',
        definition,
      })
    );
  });

  it('⛔ Publish is disabled for it, and says why', async () => {
    list.mockImplementationOnce(() => Promise.resolve([broken()]));
    renderPage();
    const publish = await screen.findByRole('button', { name: 'Publish' });
    expect(publish).toBeDisabled();
    expect(publish).toHaveAttribute('title', expect.stringMatching(/definition is broken/i));
  });

  it('POSITIVE CONTROL: a broken template that is published can still be unpublished', async () => {
    list.mockImplementationOnce(() => Promise.resolve([broken({ status: 'published' })]));
    renderPage();
    const unpublish = await screen.findByRole('button', { name: 'Unpublish' });
    expect(unpublish).toBeEnabled();
    fireEvent.click(unpublish);
    await waitFor(() => expect(update).toHaveBeenCalledWith(3, { status: 'draft' }));
  });
});
