/**
 * MergeConfirmDialog — the radio keys the existing test does not press (ArrowLeft, a stray key on
 * a middle option), the failed-merge words, each option's sender / opened line when one side is
 * missing, and the visible marks of the chosen option.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type * as MergeServiceModule from '@/services/conversationMerge.service';

// A plain function, not a vi.fn: in vitest 4 a rejection returned by a module-level vi.fn fails
// the test even when the component catches it.
let mergeImpl: (...args: unknown[]) => Promise<unknown> = () => Promise.resolve();
const mergeCalls: unknown[][] = [];
const merge = (...args: unknown[]) => {
  mergeCalls.push(args);
  return mergeImpl(...args);
};
vi.mock('@/services/conversationMerge.service', async () => {
  const real = await vi.importActual<typeof MergeServiceModule>(
    '@/services/conversationMerge.service'
  );
  return {
    ...real,
    conversationMergeService: { ...real.conversationMergeService, merge },
  };
});
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'ODL' }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { MergeConfirmDialog } = await import('../MergeConfirmDialog');

const OLDEST = {
  id: 1,
  publicId: 'SUP-1',
  subject: 'First',
  createdAt: '2026-08-01T00:00:00Z',
  sender: 'a@x.io',
};
const MIDDLE = {
  id: 2,
  publicId: 'SUP-2',
  subject: 'Second',
  createdAt: '2026-08-02T00:00:00Z',
  sender: 'b@x.io',
};
const NEWEST = {
  id: 3,
  publicId: 'SUP-3',
  subject: 'Third',
  createdAt: '2026-08-03T00:00:00Z',
  sender: 'c@x.io',
};

beforeEach(() => {
  mergeCalls.length = 0;
  mergeImpl = () => Promise.resolve();
});

const radios = () =>
  within(screen.getByRole('radiogroup', { name: 'Keep this thread' })).getAllByRole('radio');
const checked = () => radios().map((radio) => radio.getAttribute('aria-checked'));

describe('MergeConfirmDialog — radio keys', () => {
  // OLDEST is the default survivor; put it in the MIDDLE so both directions have somewhere to go.
  const renderThree = () =>
    render(
      <MergeConfirmDialog
        open
        rows={[MIDDLE, OLDEST, NEWEST]}
        onOpenChange={vi.fn()}
        onMerged={vi.fn()}
      />
    );

  it('ArrowLeft moves AND selects the previous option', () => {
    renderThree();
    expect(checked()).toEqual(['false', 'true', 'false']);
    radios()[1].focus();
    fireEvent.keyDown(radios()[1], { key: 'ArrowLeft' });
    expect(checked()).toEqual(['true', 'false', 'false']);
    expect(document.activeElement).toBe(radios()[0]);
  });

  it('CONTROL: a key that is not a radio key changes nothing (on a middle option)', () => {
    renderThree();
    radios()[1].focus();
    fireEvent.keyDown(radios()[1], { key: 'a' });
    fireEvent.keyDown(radios()[1], { key: 'Tab' });
    expect(checked()).toEqual(['false', 'true', 'false']);
    expect(document.activeElement).toBe(radios()[1]);
  });
});

describe('MergeConfirmDialog — a failed merge', () => {
  it('a server error (5xx) says the generic line, never nothing', async () => {
    mergeImpl = () =>
      Promise.reject(
        Object.assign(new Error('Request failed'), {
          isAxiosError: true,
          response: { status: 500, data: { error: 'relation "x" does not exist' } },
        })
      );
    render(
      <MergeConfirmDialog open rows={[OLDEST, NEWEST]} onOpenChange={vi.fn()} onMerged={vi.fn()} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));
    const line = await screen.findByText('These threads could not be merged. Nothing was changed.');
    expect(line).toHaveClass('text-destructive');
    expect(screen.queryByText(/relation/)).toBeNull();
  });

  it('CONTROL: a 4xx with a reason shows that reason', async () => {
    mergeImpl = () =>
      Promise.reject(
        Object.assign(new Error('Request failed'), {
          isAxiosError: true,
          response: { status: 400, data: { error: 'Different channels cannot merge' } },
        })
      );
    render(
      <MergeConfirmDialog open rows={[OLDEST, NEWEST]} onOpenChange={vi.fn()} onMerged={vi.fn()} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));
    expect(await screen.findByText('Different channels cannot merge')).toBeInTheDocument();
    await waitFor(() => expect(mergeCalls).toHaveLength(1));
  });
});

describe('MergeConfirmDialog — each option’s second line', () => {
  it('only one side known: just that side, no stray separator', () => {
    const DATE_ONLY = {
      id: 4,
      publicId: 'SUP-4',
      subject: 'Dated',
      createdAt: '2026-08-04T00:00:00Z',
    };
    const SENDER_ONLY = { id: 5, publicId: 'SUP-5', subject: 'Undated', sender: 'e@x.io' };
    const NEITHER = { id: 6, publicId: 'SUP-6', subject: 'Bare' };
    render(
      <MergeConfirmDialog
        open
        rows={[DATE_ONLY, SENDER_ONLY, NEITHER]}
        onOpenChange={vi.fn()}
        onMerged={vi.fn()}
      />
    );
    const [dated, undated, bare] = radios();
    const second = (radio: HTMLElement) =>
      radio.querySelector('span.flex-col > span.text-\\[12px\\]')?.textContent ?? null;
    expect(second(dated)).toBe(`opened ${new Date(DATE_ONLY.createdAt).toLocaleDateString()}`);
    // No date: no "opened Invalid Date", and no trailing separator.
    expect(second(undated)).toBe('e@x.io');
    expect(undated).not.toHaveTextContent('opened');
    // Neither side: no second line at all.
    expect(second(bare)).toBeNull();
  });
});

describe('MergeConfirmDialog — the chosen option is visibly marked', () => {
  it('the checked option is a highlighted card with a filled dot; the others an outlined dot', () => {
    render(
      <MergeConfirmDialog open rows={[NEWEST, OLDEST]} onOpenChange={vi.fn()} onMerged={vi.fn()} />
    );
    const [other, chosen] = radios();
    expect(chosen).toHaveAttribute('aria-checked', 'true');
    for (const cls of [
      'w-full',
      'h-auto',
      'justify-start',
      'flex',
      'items-start',
      'border-primary',
      'bg-primary-muted',
    ])
      expect(chosen).toHaveClass(cls);
    expect(other).toHaveClass('w-full', 'flex', 'items-start');
    expect(other).not.toHaveClass('bg-primary-muted');
    const dot = (radio: HTMLElement) => radio.querySelector('span[aria-hidden]') as HTMLElement;
    expect(dot(chosen)).toHaveClass(
      'rounded-full',
      'w-3.5',
      'border-4',
      'border-primary',
      'bg-card'
    );
    expect(dot(chosen)).not.toHaveClass('border-[1.5px]');
    expect(dot(other)).toHaveClass(
      'rounded-full',
      'w-3.5',
      'border-[1.5px]',
      'border-border-strong'
    );
    expect(dot(other)).not.toHaveClass('border-4');
  });
});
