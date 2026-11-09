/**
 * The owner's rule for the action bar (D2): an action that fits NONE of the selection is not
 * shown, one that fits some shows how many, one that fits all shows plain.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BulkActionBar } from '../BulkActionBar';
import type { BulkAction, BulkPreview } from '../bulkActions';

const preview = (action: BulkAction, eligible: number[], refusedCount = 0): BulkPreview => ({
  action,
  eligible,
  refused: Array.from({ length: refusedCount }, (_, idx) => ({
    id: 900 + idx,
    reason: 'no_reply_to_save' as const,
  })),
});

const bar = (previews: Partial<Record<BulkAction, BulkPreview>>, selectedCount = 3) =>
  render(
    <BulkActionBar
      selectedCount={selectedCount}
      previews={previews}
      loading={false}
      onPick={vi.fn()}
      onClear={vi.fn()}
    />
  );

describe('BulkActionBar', () => {
  it('is absent entirely when nothing is selected', () => {
    const { container } = render(
      <BulkActionBar
        selectedCount={0}
        previews={{}}
        loading={false}
        onPick={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('hides an action that fits none of the selection', () => {
    // The owner's own example: three unanswered threads cannot be resolved to the KB.
    bar({ resolve: preview('resolve', [1, 2, 3]), resolve_kb: preview('resolve_kb', [], 3) });

    expect(screen.getByRole('button', { name: /^Resolve$/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /save to KB/i })).toBeNull();
  });

  it('shows how many an action fits when it fits only some', () => {
    bar({ resolve_kb: preview('resolve_kb', [1], 2) });

    const button = screen.getByRole('button', { name: /save to KB/i });
    // "1 of 3" — the agent must be able to see the difference from "all 3" before pressing.
    expect(button.textContent).toContain('1 of 3');
  });

  it('shows no count when the action fits the whole selection', () => {
    bar({ resolve: preview('resolve', [1, 2, 3]) });

    const button = screen.getByRole('button', { name: /^Resolve/ });
    expect(button.textContent).not.toContain('of 3');
  });

  it('says so when nothing can be done, rather than showing an empty bar', () => {
    // An empty bar reads as "nothing happened"; this reads as an answer.
    bar({ resolve: preview('resolve', [], 3) });
    expect(screen.getByText(/Nothing can be done/i)).toBeTruthy();
  });

  it('omits an action the server would not describe (no permission)', () => {
    // A 403 on the preview leaves that action out of `previews` entirely: never offer what the
    // server will refuse.
    bar({ resolve: preview('resolve', [1, 2, 3]) });
    expect(screen.queryByRole('button', { name: /Assign/i })).toBeNull();
  });
});
