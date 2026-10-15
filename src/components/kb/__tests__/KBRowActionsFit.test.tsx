/**
 * 🔴 Found recording a demo (2026-10-15): in the Knowledge Base list an icon sat on the end of the
 * word on every "Pending" status pill. A Pending entry offers five actions (View, Approve, Reject,
 * Hide, Delete); at `size="sm"` they were wider than the Actions column, and the `justify-end` row
 * overflowed out of its START edge — over the Status column. Measured in headless Chrome against
 * the demo at 1440px: the View button started 56px left of its own cell, on top of the pill.
 *
 * jsdom has no layout, so this pins the arithmetic the layout rests on: the column's width minus
 * its padding holds five square buttons and their gaps, and the row wraps instead of spilling.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { KBEntry } from '@/services/kb.service';

vi.mock('@/components/admin/DepartmentBadge', () => ({ default: () => null }));
const { KBTableView } = await import('../KBTableView');

const pending: KBEntry = {
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

const TW_UNIT_PX = 4; // Tailwind spacing scale: w-48 = 12rem = 48 × 4px
const twPx = (classes: string, prefix: string): number => {
  const match = classes.match(new RegExp(`(?:^|\\s)${prefix}-(\\d+)(?:\\s|$)`));
  if (!match) throw new Error(`no ${prefix}-N in "${classes}"`);
  return Number(match[1]) * TW_UNIT_PX;
};

const renderPending = () => {
  const { container } = render(
    <MemoryRouter>
      <KBTableView
        entries={[pending]}
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
  return container;
};

describe('Knowledge Base list — a Pending row’s actions stay in their own column', () => {
  it('🔴 five actions fit the Actions column, and the row wraps rather than overflow', () => {
    const container = renderPending();
    expect(screen.getByText('Pending')).toBeTruthy();
    const actions = screen.getByTestId('kb-row-actions');
    const buttons = actions.querySelectorAll(':scope > button');
    expect(buttons).toHaveLength(5);

    // An overflowing `justify-end` row spills out of its start edge; a wrapping one cannot.
    expect(actions.className).toMatch(/(?:^|\s)flex-wrap(?:\s|$)/);

    const cols = container.querySelectorAll('colgroup col');
    const column = twPx(cols[cols.length - 1].className, 'w');
    const cellPadding = 2 * twPx(actions.parentElement?.className ?? '', 'px');
    // Every direct child button is forced square by the row's own `[&>button]` classes.
    const button = Number(actions.className.match(/\[&>button\]:w-(\d+)/)?.[1]) * TW_UNIT_PX;
    const gap = twPx(actions.className, 'gap');
    expect(actions.className).toContain('[&>button]:px-0');
    expect(buttons.length * button + (buttons.length - 1) * gap).toBeLessThanOrEqual(
      column - cellPadding
    );
  });
});
