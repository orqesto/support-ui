/**
 * The qualifying line has to be optional, and it has to be a SEPARATE line.
 *
 * These cards sit in a five-column grid at xl, and the hint is a single flex row. Appending
 * `median 41m · 42 threads` to it would have overflowed a narrow card; a second line cannot,
 * whatever the width. And fourteen of the fifteen cards have nothing to qualify, so they must
 * keep the height they have.
 */
import { vi, describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Timer } from 'lucide-react';
import { DashboardSLASection } from '../DashboardStatCards';

const card = (over: Record<string, unknown> = {}) => ({
  title: 'Avg First Response',
  value: '5h 5m',
  icon: Timer,
  color: '',
  bg: '',
  borderColor: '#2563eb',
  hint: 'Last 30 days',
  onClick: vi.fn(),
  ...over,
});

afterEach(cleanup);

describe('stat card detail line', () => {
  it('shows the qualifier beneath the headline', () => {
    render(<DashboardSLASection cards={[card({ detail: 'median 41m · 42 threads' })]} />);
    expect(screen.getByText('5h 5m')).toBeTruthy();
    expect(screen.getByText('Last 30 days')).toBeTruthy();
    expect(screen.getByText('median 41m · 42 threads')).toBeTruthy();
  });

  it('renders no extra element when a card has nothing to qualify', () => {
    const { container } = render(<DashboardSLASection cards={[card()]} />);
    // Exactly the one hint paragraph — the other cards must not gain a blank line.
    expect(container.querySelectorAll('p').length).toBe(1);
  });

  it('keeps the detail out of the click target decision', () => {
    // A card with a detail but no number should still not be clickable.
    const onClick = vi.fn();
    render(
      <DashboardSLASection
        cards={[card({ value: '—', detail: '3 threads', isClickable: false, onClick })]}
      />
    );
    fireEvent.click(screen.getByText('—'));
    expect(onClick).not.toHaveBeenCalled();
  });
});
