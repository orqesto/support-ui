import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MessageThread } from '@/services/message.service';
import {
  fitClass,
  SIGNALS_MIN_WIDTH,
  TABLE_MIN_WIDTH,
  tableFitFor,
  THREAD_TABLE_GRID,
  threadTableGrid,
  type TableFit,
} from '../threadTableParts';

/**
 * The table in the split pane follows the room the list HAS, not the window: beside the rail a
 * 1920px window leaves the list ~745px — enough for the columns — and the pane used to force the
 * two-line rows there anyway. The full-width list (no fit) keeps the window breakpoints, unchanged.
 */

vi.mock('@/features/settings/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => null }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'COR' }));
vi.mock('@/services/message.service', () => ({ messageService: {} }));

import { MessageListItem } from '../../MessageListItem';

afterEach(cleanup);

describe('tableFitFor', () => {
  it('two-line rows below the table width', () => {
    expect(tableFitFor(0)).toBe('two-line');
    expect(tableFitFor(TABLE_MIN_WIDTH - 1)).toBe('two-line');
  });
  it('the md columns from the table width', () => {
    expect(tableFitFor(TABLE_MIN_WIDTH)).toBe('table');
    expect(tableFitFor(SIGNALS_MIN_WIDTH - 1)).toBe('table');
  });
  it('the signals column from the signals width', () => {
    expect(tableFitFor(SIGNALS_MIN_WIDTH)).toBe('signals');
  });
});

describe('fitClass / threadTableGrid', () => {
  it('without a fit, the window breakpoints decide (the full-width list)', () => {
    expect(fitClass(undefined, 'md:grid')).toBe('hidden md:grid');
    expect(fitClass(undefined, 'xl:flex')).toBe('hidden xl:flex');
    expect(threadTableGrid(undefined)).toBe(THREAD_TABLE_GRID);
  });
  it('a measured fit sets each column on or off, with no breakpoint left in', () => {
    const cases: Array<[TableFit, string, string]> = [
      ['two-line', 'hidden', 'hidden'],
      ['table', 'grid', 'hidden'],
      ['signals', 'grid', 'flex'],
    ];
    for (const [fit, md, xl] of cases) {
      expect(fitClass(fit, 'md:grid')).toBe(md);
      expect(fitClass(fit, 'xl:flex')).toBe(xl);
      expect(threadTableGrid(fit)).not.toMatch(/\b(md|xl):/);
    }
    expect(threadTableGrid('two-line')).toBe('');
    expect(threadTableGrid('signals')).toContain('minmax(0,190px)');
    expect(threadTableGrid('table')).not.toContain('minmax(0,190px)');
  });
});

const thread = {
  threadId: 'conv_7',
  publicId: 'TRA-SUP-7',
  sender: 'Ada Lovelace <ada@shop.example>',
  subject: 'Refund?',
  status: 'open',
  priority: 'medium',
  lastMessageAt: new Date().toISOString(),
  latestMessage: {
    id: 1,
    conversationId: 7,
    type: 'inbound',
    status: 'open',
    content: 'Where is my refund?',
    channel: 'email',
    createdAt: new Date().toISOString(),
    metadata: {},
  },
} as unknown as MessageThread;

const rowClass = (fit?: TableFit) => {
  const { container } = render(
    <MemoryRouter>
      <MessageListItem thread={thread} onOpen={() => {}} density="compact" fit={fit} />
    </MemoryRouter>
  );
  return container.querySelector('[data-thread-row]')?.className ?? '';
};

describe('thread table row by fit', () => {
  it('two-line: the two-column form, as the split pane drew before', () => {
    const cls = rowClass('two-line');
    expect(cls).toContain('grid-cols-[minmax(0,1fr)_auto]');
    expect(cls).not.toContain('max-md:');
  });
  it('table: the columns, whatever the window', () => {
    const cls = rowClass('table');
    expect(cls).toContain(threadTableGrid('table'));
    expect(cls).not.toContain('max-md:');
  });
  it('no fit: unchanged — two-line below md, columns above', () => {
    const cls = rowClass(undefined);
    expect(cls).toContain('max-md:grid-cols-[minmax(0,1fr)_auto]');
    expect(cls).toContain(THREAD_TABLE_GRID);
  });
});
