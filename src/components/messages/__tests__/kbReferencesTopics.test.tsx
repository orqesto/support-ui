/**
 * Mutation batch (message detail v4), chunk 4: a KB entry's topics line shows the first two and
 * says "..." only when there are more — pinned, since every mutant of that line survived.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { MessageKBReferences } from '../MessageKBReferences';

const getKBReferences = vi.fn<(id: number) => Promise<unknown>>();
vi.mock('@/services/message.service', () => ({
  messageService: { getKBReferences: (id: number) => getKBReferences(id) },
}));

afterEach(() => {
  cleanup();
  getKBReferences.mockReset();
});

const entry = (id: number, title: string, topics: string[]) => ({
  id,
  title,
  type: 'faq',
  topics,
  qualityScore: 0,
  timesReferenced: 0,
  approved: true,
});

describe('the topics line', () => {
  it('two topics read in full; three read as the first two and "..."; none reads nothing', async () => {
    getKBReferences.mockResolvedValue({
      success: true,
      data: [
        entry(1, 'Refunds', ['billing', 'returns']),
        entry(2, 'Sizing', ['fit', 'measurements', 'exchanges']),
        entry(3, 'Hours', []),
      ],
    });
    render(<MessageKBReferences messageId={7} />);
    const line = (title: string) =>
      (screen.getByText(title).closest('li') as HTMLElement).textContent ?? '';
    expect(await screen.findByText('Refunds')).toBeInTheDocument();
    expect(line('Refunds')).toContain('billing, returns');
    expect(line('Refunds')).not.toContain('...');
    expect(line('Sizing')).toContain('fit, measurements...');
    expect(line('Sizing')).not.toContain('exchanges');
    expect(line('Hours')).not.toContain(', ');
  });
});
