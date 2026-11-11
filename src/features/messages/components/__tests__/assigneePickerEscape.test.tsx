import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MessageThread } from '@/services/message.service';

/**
 * Escape closes a row's assignee picker (list row, Kanban card) and puts focus back on Claim.
 * Until 2026-11-11 only a click outside closed it. An Escape that closed the assignee list must not
 * close the picker too; every other Escape in it must (react-select marks them ALL defaultPrevented,
 * which the first version read — and so never closed once focus was in the assignee box).
 */

vi.mock('@/features/settings/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (pick: (state: { user: { id: number } }) => unknown) => pick({ user: { id: 5 } }),
}));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'COR' }));
vi.mock('@/services/message.service', () => ({ messageService: {} }));
vi.mock('../../presence/useWritingGuard', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useListWritingGuard: () => ({
    confirmIfWriting: (_label: string, run: () => void) => run(),
    dialog: null,
  }),
}));
// The real Select fetches assignees; a stand-in that treats Escape the way it does: react-select
// prevents default on EVERY Escape, open or not, and the Select stops the native event only when
// the Escape closed its open list.
vi.mock('@/components/admin/AssignmentSelect', () => ({
  AssignmentSelect: () => (
    <input
      aria-label="Assignee"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        if (event.currentTarget.value === 'list open') event.nativeEvent.stopPropagation();
      }}
    />
  ),
}));

import { RowAssignee } from '../RowAssignee';
import { KanbanCard } from '../KanbanCard';

afterEach(cleanup);

const thread = (): MessageThread =>
  ({
    threadId: 'conv_7',
    sender: 'marta@northwind.example',
    subject: 'Wrong size, need exchange',
    status: 'open',
    priority: 'high',
    lastMessageAt: new Date().toISOString(),
    messageCount: 1,
    latestMessage: {
      id: 7,
      conversationId: 7,
      publicId: 'SUP-7',
      type: 'inbound',
      status: 'open',
      priority: 'high',
      content: 'I still have not got the label.',
      subject: 'Wrong size, need exchange',
      channel: 'email',
      createdAt: new Date().toISOString(),
      assigneeId: null,
      metadata: {},
    },
  }) as unknown as MessageThread;

const surfaces = [
  ['list row', () => <RowAssignee thread={thread()} />],
  ['Kanban card', () => <KanbanCard thread={thread()} onOpen={() => {}} />],
] as const;

const openPicker = () => {
  const claim = screen.getByRole('button', { name: /Claim/ });
  fireEvent.click(claim);
  expect(screen.getByRole('dialog', { name: 'Assign to' })).toBeTruthy();
  return claim;
};

describe.each(surfaces)('%s — assignee picker and Escape', (_name, ui) => {
  it('Escape in the assignee box (list closed) closes it and puts focus back on Claim', () => {
    render(<MemoryRouter>{ui()}</MemoryRouter>);
    const claim = openPicker();
    fireEvent.keyDown(screen.getByLabelText('Assignee'), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Assign to' })).toBeNull();
    expect(document.activeElement).toBe(claim);
  });

  it('Escape on Claim itself (picker open) closes it', () => {
    render(<MemoryRouter>{ui()}</MemoryRouter>);
    const claim = openPicker();
    fireEvent.keyDown(claim, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Assign to' })).toBeNull();
  });

  it('an Escape that closed the open assignee list leaves the picker open', () => {
    render(<MemoryRouter>{ui()}</MemoryRouter>);
    openPicker();
    const select = screen.getByLabelText('Assignee');
    fireEvent.change(select, { target: { value: 'list open' } });
    fireEvent.keyDown(select, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Assign to' })).toBeTruthy();
  });

  it('CONTROL: another key leaves the picker open', () => {
    render(<MemoryRouter>{ui()}</MemoryRouter>);
    openPicker();
    fireEvent.keyDown(screen.getByLabelText('Assignee'), { key: 'a' });
    expect(screen.getByRole('dialog', { name: 'Assign to' })).toBeTruthy();
  });
});
