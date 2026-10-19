/**
 * 🔴 Found recording a demo (2026-10-14): the Knowledge Base list's Source column showed "-" for
 * every AUTOMATIC capture on Resolve; only "Resolve & save to KB" entries showed their `#id`. The
 * automatic capture keeps its conversation as `typeData.questionMessageId` (with
 * `typeData.source = 'resolved_message'`), not as `metadata.sourceMessageId` (lib/kbSource.ts).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { KBEntry } from '@/services/kb.service';
import { kbSourceConversationId } from '@/lib/kbSource';

vi.mock('@/components/admin/DepartmentBadge', () => ({ default: () => null }));
const { KBTableView } = await import('../KBTableView');

const base: KBEntry = {
  id: 9,
  type: 'qa_pair',
  title: 'Q: Can I add insurance after booking?',
  content: 'Question: Can I add insurance after booking?\n\nAnswer: Yes, until pickup.',
  category: 'support',
  departmentId: null,
  qualityScore: 0.8,
  approved: false,
  hidden: false,
  usageCount: 0,
  createdAt: '2026-10-14T09:00:00.000Z',
  sourceDeleted: false,
};
const automatic: KBEntry = {
  ...base,
  typeData: { source: 'resolved_message', questionMessageId: 18, answerMessageId: null },
};
const savedToKb: KBEntry = { ...base, metadata: { sourceMessageId: 4 } };
// A MINED pair's questionMessageId is a message EVENT id, not a conversation.
const mined: KBEntry = { ...base, typeData: { questionMessageId: 777, answerMessageId: 778 } };

const sourceCell = (entry: KBEntry) => {
  render(
    <MemoryRouter>
      <KBTableView
        entries={[entry]}
        loading={false}
        canReview
        onView={vi.fn()}
        onApprove={vi.fn()}
        onHide={vi.fn()}
        onUnhide={vi.fn()}
        onReject={vi.fn()}
        onDelete={vi.fn()}
      />
    </MemoryRouter>
  );
  return within(screen.getAllByRole('row')[1]);
};

describe('Knowledge Base list — Source', () => {
  it('🔴 an automatic capture on Resolve links to its conversation', () => {
    const link = sourceCell(automatic).getByRole('link', { name: '#18' });
    expect(link.getAttribute('href')).toBe('/threads?id=18');
  });

  it('a Save-to-KB entry still links to its conversation', () => {
    expect(sourceCell(savedToKb).getByRole('link', { name: '#4' }).getAttribute('href')).toBe(
      '/threads?id=4'
    );
  });

  it("control: a mined pair's event id is never shown as a conversation", () => {
    expect(kbSourceConversationId(mined)).toBeNull();
    expect(sourceCell(mined).queryByRole('link', { name: '#777' })).toBeNull();
  });
});
