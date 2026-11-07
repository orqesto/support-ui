/**
 * The approved tick on a KB entry saved from this thread is an icon only: its name ("Approved")
 * is the only thing a screen reader hears, so an unapproved entry must not have it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, within } from '@testing-library/react';
import { MessageKBReferences } from '../MessageKBReferences';

const getKBReferences = vi.fn<(id: number) => Promise<unknown>>();
vi.mock('@/services/message.service', () => ({
  messageService: { getKBReferences: (id: number) => getKBReferences(id) },
}));

afterEach(() => {
  cleanup();
  getKBReferences.mockReset();
});

const entry = (id: number, title: string, approved: boolean) => ({
  id,
  title,
  type: 'faq',
  topics: [],
  qualityScore: 0,
  timesReferenced: 0,
  approved,
});

describe('the approved tick', () => {
  it('is named "Approved" on an approved entry and absent on an unapproved one', async () => {
    getKBReferences.mockResolvedValue({
      success: true,
      data: [entry(1, 'Refund policy', true), entry(2, 'Sizing chart', false)],
    });
    render(<MessageKBReferences messageId={7} />);
    const approved = (await screen.findByText('Refund policy')).closest('li')!;
    const pending = screen.getByText('Sizing chart').closest('li')!;
    expect(within(approved).getByLabelText('Approved')).toBeInTheDocument();
    expect(within(pending).queryByLabelText('Approved')).toBeNull();
    expect(screen.getAllByLabelText('Approved')).toHaveLength(1);
  });
});

describe('the section', () => {
  it('is a region named by its heading', async () => {
    getKBReferences.mockResolvedValue({ success: true, data: [entry(1, 'Refund policy', true)] });
    render(<MessageKBReferences messageId={7} />);
    const region = await screen.findByRole('region', {
      name: 'Saved to the knowledge base from this thread',
    });
    expect(within(region).getByText('Refund policy')).toBeInTheDocument();
  });
});
