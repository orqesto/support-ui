import { describe, it, expect } from 'vitest';
import { initialFromTemplate } from '../templateInitial';
import type { TemplateLookup } from '@/services/customApiTemplates.service';

const lookup = (over: Partial<TemplateLookup> = {}): TemplateLookup =>
  ({
    key: 'order_number',
    label: 'Look up an order number',
    description: '',
    category: 'order',
    parameterSource: 'manual',
    surface: 'thread',
    resultShape: 'one',
    checklist: [],
    statusWords: { shipped: 'On its way' },
    ownershipFrom: 'orders',
    ...over,
  }) as TemplateLookup;

describe('initialFromTemplate', () => {
  it('copies the defaults and points ownership at the saved source lookup', () => {
    expect(initialFromTemplate('order_tracking', lookup(), { orders: 41 })).toEqual({
      label: 'Look up an order number',
      category: 'order',
      parameterSource: 'manual',
      resultShape: 'one',
      statusLabels: { shipped: 'On its way' },
      ownershipSourceEndpointId: 41,
      createExtras: { surface: 'thread', templateKey: 'order_tracking' },
    });
  });

  it('⛔ a skipped source leaves ownership unset (unverified), never a guessed id', () => {
    expect(
      initialFromTemplate('order_tracking', lookup(), {}).ownershipSourceEndpointId
    ).toBeNull();
  });

  it('the status words are a COPY — editing them cannot change the template', () => {
    const source = lookup();
    const initial = initialFromTemplate('order_tracking', source, {});
    initial.statusLabels!.shipped = 'changed';
    expect(source.statusWords.shipped).toBe('On its way');
  });

  it('D4 — applying a template pre-fills the reference name, copied once', () => {
    expect(
      initialFromTemplate('order_tracking', lookup({ referenceLabel: 'Order number' }), {})
        .referenceLabel
    ).toBe('Order number');
  });

  it('CONTROL: a template lookup without one leaves it unset', () => {
    expect('referenceLabel' in initialFromTemplate('order_tracking', lookup(), {})).toBe(false);
  });

  it('the template "when nothing is found" text pre-fills the new lookup, trimmed', () => {
    const withHint = { ...lookup(), noMatchHint: '  Ask for the order number. ' } as TemplateLookup;
    expect(initialFromTemplate('order_tracking', withHint, {}).noMatchHint).toBe(
      'Ask for the order number.'
    );
  });

  it('CONTROL: a template without one (or a blank one) leaves it unset', () => {
    expect('noMatchHint' in initialFromTemplate('order_tracking', lookup(), {})).toBe(false);
    const blank = { ...lookup(), noMatchHint: '  ' } as TemplateLookup;
    expect('noMatchHint' in initialFromTemplate('order_tracking', blank, {})).toBe(false);
  });
});
