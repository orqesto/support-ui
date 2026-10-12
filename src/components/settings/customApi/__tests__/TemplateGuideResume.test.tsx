/**
 * F4: leaving a template part-way says what was kept and what was not, and applying a template
 * again offers the lookup it already made instead of silently creating a second one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { EndpointWizardProps } from '../endpointWizardProps';
import type { CustomApiConnection } from '@/services/customApi.service';
import type { CustomApiTemplate } from '@/services/customApiTemplates.service';

const mounted: EndpointWizardProps[] = [];
vi.mock('../EndpointWizard', () => ({
  EndpointWizard: (props: EndpointWizardProps) => {
    mounted.push(props);
    return (
      <div data-testid="wizard">
        <span>{props.initial?.label}</span>
        <button onClick={() => props.onCreated?.(101)}>fake test</button>
        <button
          onClick={() => {
            props.onSaved();
            props.onClose();
          }}
        >
          fake save
        </button>
        <button onClick={() => props.onClose()}>fake cancel</button>
      </div>
    );
  },
}));
const list = vi.fn<() => Promise<unknown[]>>();
vi.mock('@/services/customApi.service', async (importActual) => ({
  ...(await importActual<object>()),
  customApiService: { list: () => list() },
}));

const { TemplateGuide } = await import('../TemplateGuide');

const lookup = (
  key: string,
  label: string,
  parameterSource: 'identity' | 'manual',
  ownershipFrom: string | null
) => ({
  key,
  label,
  description: '',
  category: 'order',
  parameterSource,
  surface: 'both',
  resultShape: 'many',
  checklist: [],
  statusWords: {},
  ownershipFrom,
});
const template = {
  id: 1,
  key: 'order_tracking',
  name: 'Order tracking',
  description: '',
  status: 'published',
  updatedAt: '',
  definition: {
    version: 1,
    lookups: [
      lookup('orders', "This customer's orders", 'identity', null),
      lookup('order_number', 'Look up an order number', 'manual', 'orders'),
    ],
  },
} as unknown as CustomApiTemplate;
const endpoint = (over: Record<string, unknown>) => ({
  id: 55,
  label: 'My orders',
  templateKey: 'order_tracking',
  parameterSource: 'identity',
  ...over,
});
const conn = (endpoints: unknown[] = []) =>
  ({ id: 9, endpoints }) as unknown as CustomApiConnection;

const renderGuide = (connection = conn()) => {
  const onDone = vi.fn<(notice?: string) => void>();
  const onCancel = vi.fn<(notice?: string) => void>();
  render(
    <TemplateGuide
      connection={connection}
      template={template}
      onDone={onDone}
      onCancel={onCancel}
    />
  );
  return { onDone, onCancel };
};

beforeEach(() => {
  mounted.length = 0;
  // The admin renamed the lookup in the form: the notice uses the SAVED label.
  list.mockReset().mockResolvedValue([conn([endpoint({ id: 101, label: 'Orders by email' })])]);
});

describe('F4 — leaving a template part-way', () => {
  it('Cancel after step 1 was saved names what was kept and what was not', async () => {
    const { onCancel } = renderGuide();
    fireEvent.click(screen.getByText('fake test'));
    fireEvent.click(screen.getByText('fake save'));
    await screen.findByText('Look up an order number');
    fireEvent.click(screen.getByText('fake cancel'));
    expect(onCancel).toHaveBeenCalledWith(
      'Step 1 was saved as “Orders by email”. Step 2 was not added — start the template again to add it.'
    );
  });

  it('Skip on the last step after a save finishes WITH the notice', async () => {
    const { onDone } = renderGuide();
    fireEvent.click(screen.getByText('fake test'));
    fireEvent.click(screen.getByText('fake save'));
    await screen.findByText('Look up an order number');
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    expect(onDone).toHaveBeenCalledWith(
      'Step 1 was saved as “Orders by email”. Step 2 was not added — start the template again to add it.'
    );
  });

  it('POSITIVE CONTROL: Cancel with nothing saved carries no notice', () => {
    const { onCancel } = renderGuide();
    fireEvent.click(screen.getByText('fake cancel'));
    expect(onCancel).toHaveBeenCalledWith(undefined);
  });

  it('POSITIVE CONTROL: finishing every step carries no notice', async () => {
    const { onDone } = renderGuide();
    fireEvent.click(screen.getByText('fake test'));
    fireEvent.click(screen.getByText('fake save'));
    await screen.findByText('Look up an order number');
    fireEvent.click(screen.getByText('fake save'));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(undefined));
  });
});

describe('F4 — applying a template that was already applied', () => {
  it('⛔ shows the step as already set up instead of opening a form that would duplicate it', () => {
    renderGuide(conn([endpoint({})]));
    expect(screen.getByText(/Already set up: “My orders”/)).toBeInTheDocument();
    expect(screen.queryByTestId('wizard')).toBeNull();
  });

  it('“Use the existing one” moves on, and the next step’s ownership points at it', async () => {
    renderGuide(conn([endpoint({})]));
    fireEvent.click(screen.getByRole('button', { name: 'Use the existing one' }));
    await screen.findByText('Look up an order number');
    expect(mounted.at(-1)!.initial?.ownershipSourceEndpointId).toBe(55);
    expect(list).not.toHaveBeenCalled();
  });

  it('“Add another one” is a deliberate choice that opens the form', () => {
    renderGuide(conn([endpoint({})]));
    fireEvent.click(screen.getByRole('button', { name: 'Add another one' }));
    expect(screen.getByTestId('wizard')).toBeInTheDocument();
    expect(screen.getByText("This customer's orders")).toBeInTheDocument();
  });

  it('Cancel after using the existing one says step 1 is the existing lookup', async () => {
    const { onCancel } = renderGuide(conn([endpoint({})]));
    fireEvent.click(screen.getByRole('button', { name: 'Use the existing one' }));
    await screen.findByText('Look up an order number');
    fireEvent.click(screen.getByText('fake cancel'));
    expect(onCancel).toHaveBeenCalledWith(
      'Step 1 uses the existing “My orders”. Step 2 was not added — start the template again to add it.'
    );
  });

  it('POSITIVE CONTROL: another template’s lookup, or another kind of look-up, is not “already set up”', () => {
    renderGuide(
      conn([
        endpoint({ id: 60, templateKey: 'parcel_tracking' }),
        endpoint({ id: 61, parameterSource: 'manual' }),
        endpoint({ id: 62, templateKey: null }),
      ])
    );
    expect(screen.queryByText(/Already set up/)).toBeNull();
    expect(screen.getByTestId('wizard')).toBeInTheDocument();
  });
});
