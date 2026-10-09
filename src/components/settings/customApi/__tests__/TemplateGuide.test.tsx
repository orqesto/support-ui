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
        <button onClick={() => props.onCreated?.(100 + mounted.length)}>fake test</button>
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

const connection = { id: 9, endpoints: [] } as unknown as CustomApiConnection;
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
  checklist: [{ role: 'identifier', label: 'Order number', required: true }],
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

beforeEach(() => {
  mounted.length = 0;
  list.mockReset().mockResolvedValue([{ id: 9, endpoints: [{ id: 101 }] }]);
});

describe('TemplateGuide', () => {
  it('step 1 → save → step 2 with ownership on step 1’s lookup and a FRESH connection', async () => {
    const onDone = vi.fn();
    render(
      <TemplateGuide
        connection={connection}
        template={template}
        onDone={onDone}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText("This customer's orders")).toBeInTheDocument();
    fireEvent.click(screen.getByText('fake test')); // creates id 101
    fireEvent.click(screen.getByText('fake save'));
    await screen.findByText('Look up an order number');
    const step2 = mounted.at(-1)!;
    expect(step2.initial?.ownershipSourceEndpointId).toBe(101);
    expect(step2.connection.endpoints.map((ep) => ep.id)).toEqual([101]);
    fireEvent.click(screen.getByText('fake save'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('⛔ skipping the list leaves step 2 without an ownership source', async () => {
    render(
      <TemplateGuide
        connection={connection}
        template={template}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: "My API can't list a customer's records — skip" })
    );
    await screen.findByText('Look up an order number');
    expect(mounted.at(-1)!.initial?.ownershipSourceEndpointId).toBeNull();
  });

  it('cancel inside the form leaves the guide; save does NOT count as cancel', async () => {
    const onCancel = vi.fn();
    render(
      <TemplateGuide
        connection={connection}
        template={template}
        onDone={vi.fn()}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByText('fake save'));
    await screen.findByText('Look up an order number');
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('fake cancel'));
    expect(onCancel).toHaveBeenCalled();
  });
});
