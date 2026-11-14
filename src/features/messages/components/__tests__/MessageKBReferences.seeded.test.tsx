/**
 * Back on a thread seen a moment ago (an open tab), the references are drawn at once from the last
 * read and refreshed behind them — no spinner over a list the agent just saw (seededState).
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

const entry = (id: number, title: string) => ({
  id,
  title,
  type: 'faq',
  topics: [],
  qualityScore: 0,
  timesReferenced: 0,
  approved: false,
});

describe('a thread opened again', () => {
  it('shows its references at once and refreshes them', async () => {
    getKBReferences.mockResolvedValue({ success: true, data: [entry(1, 'Refund policy')] });
    const first = render(<MessageKBReferences messageId={7} />);
    await screen.findByText('Refund policy');
    first.unmount();

    let answer: (value: unknown) => void = () => undefined;
    getKBReferences.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    render(<MessageKBReferences messageId={7} />);
    // Drawn before the read answers.
    expect(screen.getByText('Refund policy')).toBeInTheDocument();
    expect(getKBReferences).toHaveBeenCalledTimes(2);
    answer({ success: true, data: [entry(1, 'Refund policy'), entry(2, 'Sizing chart')] });
    expect(await screen.findByText('Sizing chart')).toBeInTheDocument();
  });

  it('another thread does not show this one’s references', async () => {
    getKBReferences.mockResolvedValue({ success: true, data: [entry(1, 'Refund policy')] });
    const first = render(<MessageKBReferences messageId={7} />);
    await screen.findByText('Refund policy');
    first.unmount();
    getKBReferences.mockReturnValue(new Promise(() => undefined));
    render(<MessageKBReferences messageId={8} />);
    expect(screen.queryByText('Refund policy')).toBeNull();
  });
});
