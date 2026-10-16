import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/components/kb/KbConsolidationReview', () => ({
  KbConsolidationReview: ({
    suggestionId,
    onDecided,
  }: {
    suggestionId: number;
    onDecided?: (outcome: unknown) => void;
  }) => (
    <button type="button" onClick={() => onDecided?.({ status: 'accepted' })}>
      merge {suggestionId}
    </button>
  ),
}));
vi.mock('@/components/kb/KbQualityReview', () => ({
  KbQualityReview: ({ suggestionId }: { suggestionId: number }) => <p>quality {suggestionId}</p>,
}));
const { KbDecisionDialog } = await import('../KbDecisionDialog');

afterEach(cleanup);

describe('KbDecisionDialog', () => {
  it('a merge opens the merge review; deciding refreshes the list', () => {
    const onDecided = vi.fn();
    render(
      <KbDecisionDialog
        decision={{ suggestionId: 9, kind: 'merge', reasons: [], canDecide: true }}
        onClose={() => {}}
        onDecided={onDecided}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'merge 9' }));
    expect(onDecided).toHaveBeenCalledTimes(1);
  });

  it('a removal opens the quality review', () => {
    render(
      <KbDecisionDialog
        decision={{ suggestionId: 5, kind: 'remove', reasons: [], canDecide: true }}
        onClose={() => {}}
        onDecided={() => {}}
      />
    );
    expect(screen.getByText('quality 5')).toBeInTheDocument();
  });

  it('closing without deciding still refreshes (it may have been decided elsewhere)', () => {
    const onDecided = vi.fn();
    const onClose = vi.fn();
    render(
      <KbDecisionDialog
        decision={{ suggestionId: 5, kind: 'rewrite', reasons: [], canDecide: true }}
        onClose={onClose}
        onDecided={onDecided}
      />
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    expect(onDecided).toHaveBeenCalled();
  });

  it('renders nothing while no decision is chosen', () => {
    render(<KbDecisionDialog decision={null} onClose={() => {}} onDecided={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
