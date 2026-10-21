/**
 * The Knowledge Base list is the ONE place to decide (owner rule, 2026-10-21): the cases view
 * lists and groups, it does not decide. A row offers one link into the list, where the decision
 * and its undo live.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KbWorkRowItem } from '../KbWorkRowItem';
import { KbCaseRowView } from '../KbCaseRowView';
import type { KbCaseRow, KbWorkRow } from '@/services/kbConsolidation.service';

afterEach(cleanup);

const workRow = (over: Partial<KbWorkRow> = {}): KbWorkRow => ({
  id: 42,
  title: 'Where is my parcel?',
  question: 'Where is my parcel?',
  answer: 'It is on its way.',
  status: 'pending',
  caseId: null,
  casePublicId: null,
  conversationId: null,
  conversationPublicId: null,
  canDecide: true,
  canModerate: true,
  scopeKey: 'src:1',
  ...over,
});

const renderItem = (row: KbWorkRow) =>
  render(
    <MemoryRouter>
      <ul>
        <KbWorkRowItem
          row={row}
          reason={undefined}
          caseId={null}
          busy={null}
          editLoading={false}
          error={undefined}
          orgCode={undefined}
          onEdit={vi.fn()}
          onMove={vi.fn()}
          onDetach={vi.fn()}
          onUnmerge={vi.fn()}
        />
      </ul>
    </MemoryRouter>
  );

describe('KB cases view: no decide buttons', () => {
  it('a pending capture has no Approve / Reject / Hide, and links into the list', () => {
    renderItem(workRow());
    for (const name of ['Approve', 'Reject', 'Hide', 'Unhide', 'Restore']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    expect(screen.getByRole('link', { name: 'Open in Knowledge Base' })).toHaveAttribute(
      'href',
      '/knowledge-base?id=42'
    );
    // What is kept.
    expect(screen.getByRole('button', { name: /Edit/ })).toBeInTheDocument();
  });

  it('a cleaned or held entry has no Undo clean-up / Keep using / Reject', () => {
    renderItem(
      workRow({ status: 'approved', autoCleaned: { suggestionId: 77, at: '2026-10-20' } })
    );
    expect(screen.queryByRole('button', { name: /Undo/ })).toBeNull();
    cleanup();
    renderItem(workRow({ status: 'hidden', heldForReview: { suggestionId: 78 } }));
    expect(screen.queryByRole('button', { name: 'Keep using' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
  });

  it("a proposed row's Review opens the suggested changes in the list", () => {
    const row: KbCaseRow = {
      kind: 'proposed',
      title: 'Parcel questions',
      label: null,
      language: null,
      scopeKey: null,
      caseId: null,
      casePublicId: null,
      suggestionId: 9,
      entryIds: [42, 43],
      conversations: 2,
      customers: 2,
      firstSeen: null,
      lastSeen: null,
      source: null,
    };
    render(
      <MemoryRouter>
        <ul>
          <KbCaseRowView row={row} />
        </ul>
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute(
      'href',
      '/knowledge-base?status=suggested_change&id=42'
    );
  });
});
