import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MessagesSummary, messagesSummary } from '../MessagesSummary';

afterEach(cleanup);

const period = {
  key: 'k',
  start: '2026-08-24T11:48:02Z',
  end: '2026-09-24T11:48:02Z',
  source: 'billing' as const,
};

describe('messagesSummary', () => {
  it('says AI included only when the plan carries managed AI', () => {
    expect(messagesSummary(16000, 1240, undefined, true)).toBe(
      '16,000 messages this period, AI included; 1,240 used.'
    );
    expect(messagesSummary(500, 10, undefined, false)).toBe('500 messages this period; 10 used.');
  });

  it('formats the reset day with the browser locale, like the other screens', () => {
    const expected = new Date(period.end).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
    });
    expect(messagesSummary(500, 10, period, true)).toContain(`resets ${expected}.`);
  });

  it('without AI included the line carries the own-key sentence', () => {
    render(<MessagesSummary limit={500} used={10} aiIncluded={false} />);
    expect(screen.getByTestId('messages-summary')).toHaveTextContent(
      'AI runs on your own key; your plan covers 500 messages.'
    );
    expect(screen.getByTestId('messages-summary')).not.toHaveTextContent(/AI included/);
  });
});
