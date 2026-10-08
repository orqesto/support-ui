/**
 * Mutation kills — the phone Details card (MobileSenderCard) and the meta strip's card layout
 * (HeaderMetaStrip layout="card"): the touch-target sizes and the label column a phone relies on.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import type { Message, Category } from '@/types';
import type { Label } from '@/services/settings.service';
import { MobileSenderCard } from '../MobileSenderCard';

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartmentById: () => null,
  useDepartments: () => ({ data: [] }),
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true, isOrgAdmin: true }),
}));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ id: 1, role: 'admin' }) }));
vi.mock('@/services/message.service', () => ({ messageService: {} }));
vi.mock('@/components/admin/AssignmentSelect', () => ({ AssignmentSelect: () => null }));

const { HeaderMetaStrip } = await import('../HeaderMetaStrip');

afterEach(cleanup);

const message = {
  id: 1,
  channel: 'email',
  sender: 'customer@example.com',
  subject: 'Test',
  status: 'open',
  needsHumanReview: false,
  createdAt: '2026-01-01T10:00:00Z',
  metadata: {},
} as Message;

const categories = [{ id: 3, name: 'Billing' }] as Category[];
const label = { id: 4, name: 'VIP', color: '#ff0000' } as Label;

const renderStrip = (layout?: 'inline' | 'rows' | 'card') =>
  render(
    <HeaderMetaStrip
      layout={layout}
      message={message}
      categories={categories}
      messageLabels={[label]}
      allLabels={[label]}
      hasManageLabels
      showLabelPicker={false}
      updatingCategory={false}
      onSetCategory={vi.fn()}
      onToggleLabel={vi.fn()}
      onToggleLabelPicker={vi.fn()}
      onCloseLabelPicker={vi.fn()}
      onCreateLabel={vi.fn()}
    />
  );

/** The label span of a meta row, found by its words. */
const labelSpan = (text: string) => screen.getByText(text, { selector: 'span' });

describe('HeaderMetaStrip — the phone card layout', () => {
  it('stacks 40px rows with hairlines and right-aligned values', () => {
    renderStrip('card');
    const cls = screen.getByTestId('meta-card-rows').className;
    for (const token of [
      'flex-col',
      'items-stretch',
      'pl-3',
      '[&>div]:justify-end',
      '[&>div]:min-h-10',
      '[&>div]:border-b',
      '[&>div:last-child]:border-b-0',
    ]) {
      expect(cls).toContain(token);
    }
  });

  it('the Dept value is a 36px touch target in the card', () => {
    renderStrip('card');
    const dept = screen.getByRole('button', { name: /—/ });
    expect(dept.className).toContain('h-9');
    expect(dept.className).toContain('text-[13.5px]');
  });

  it('Assigned and Category labels sit in the 84px label column, set as labels', () => {
    renderStrip('card');
    for (const text of ['Assigned', 'Category']) {
      const cls = labelSpan(text).className;
      expect(cls).toContain('w-[84px]');
      expect(cls).toContain('mr-auto');
      expect(cls).toContain('uppercase');
      expect(cls).toContain('flex-shrink-0');
    }
  });

  it('CONTROL: the sidebar rows use the 62px column', () => {
    renderStrip('rows');
    expect(labelSpan('Assigned').className).toContain('w-[62px]');
    expect(labelSpan('Category').className).toContain('w-[62px]');
  });

  it('the Add label button is a 30px dashed target in the card', () => {
    renderStrip('card');
    const add = screen.getByRole('button', { name: 'Add label' });
    for (const token of ['h-[30px]', 'w-[30px]', 'border-dashed', 'rounded-full']) {
      expect(add.className).toContain(token);
    }
  });

  it('CONTROL: inline, the Add label button is 20px tall and dashed', () => {
    renderStrip();
    const add = screen.getByRole('button', { name: 'Add label' });
    expect(add.className).toContain('h-5');
    expect(add.className).not.toContain('h-[30px]');
    expect(add.className).toContain('border-dashed');
  });

  it('the inline row has no "Labels" word (only rows and card name the row)', () => {
    renderStrip();
    expect(screen.queryByText('Labels')).toBeNull();
    cleanup();
    renderStrip('card');
    expect(screen.getByText('Labels')).toBeTruthy();
  });
});

describe('MobileSenderCard', () => {
  const open = () => fireEvent.click(screen.getByRole('button', { name: /Details/ }));

  it('recipients it cannot read: Details lists no address rows', () => {
    render(
      <MobileSenderCard name="Ada" address="ada@example.com" initials="A" recipients={null} />
    );
    open();
    const region = screen.getByRole('region', { name: 'Sender details' });
    expect(within(region).queryByRole('term')).toBeNull();
    expect(region.querySelector('dl')).toBeNull();
  });

  it('CONTROL: readable recipients list a Received at row', () => {
    render(
      <MobileSenderCard
        name="Ada"
        address="ada@example.com"
        initials="A"
        recipients={{ to: ['support@acme.com'] }}
      />
    );
    open();
    expect(screen.getByText('Received at')).toBeTruthy();
  });

  it('the Details button is a full-width 52px row', () => {
    render(
      <MobileSenderCard name="Ada" address="ada@example.com" initials="A" recipients={null} />
    );
    const cls = screen.getByRole('button', { name: /Details/ }).className;
    for (const token of ['w-full', 'min-h-[52px]', 'justify-start', 'rounded-[14px]']) {
      expect(cls).toContain(token);
    }
  });

  it('a row label sits in the 84px column, set as a label', () => {
    render(
      <MobileSenderCard
        name="Ada"
        address="ada@example.com"
        initials="A"
        recipients={{ to: ['support@acme.com'] }}
      />
    );
    open();
    const cls = screen.getByText('Received at').className;
    expect(cls).toContain('w-[84px]');
    expect(cls).toContain('flex-none');
    expect(cls).toContain('uppercase');
  });
});
