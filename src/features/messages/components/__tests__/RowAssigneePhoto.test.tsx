/**
 * Inbox rows and board cards show the assignee's profile photo in their avatar, from the key the
 * thread list sends; with none, the coloured initials as before.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MessageThread } from '@/services/message.service';

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
const assignment = vi.hoisted(() => ({
  getAssignableUsers: vi.fn(),
  assignThread: vi.fn(),
  assignMessage: vi.fn(),
  assignTicket: vi.fn(),
}));
vi.mock('@/services/assignment.service', () => ({ assignmentService: assignment }));

import { userPhotoUrl } from '@/components/ui/UserPhoto';
import { RowAssignee } from '../RowAssignee';

beforeEach(() => {
  assignment.getAssignableUsers.mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const thread = (latest: Record<string, unknown>): MessageThread =>
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
      sender: 'marta@northwind.example',
      subject: 'Wrong size, need exchange',
      channel: 'email',
      createdAt: new Date().toISOString(),
      metadata: {},
      ...latest,
    },
  }) as unknown as MessageThread;

describe('inbox row / board card assignee photo', () => {
  it('shows the assignee photo from the list key', () => {
    render(
      <MemoryRouter>
        <RowAssignee
          thread={thread({ assigneeId: 9, assigneeName: 'Dana Lee', assigneePhotoKey: 'k-dana' })}
        />
      </MemoryRouter>
    );
    expect(document.querySelector('img')?.getAttribute('src')).toBe(userPhotoUrl('k-dana'));
  });

  it('control: no key, the coloured initials', () => {
    render(
      <MemoryRouter>
        <RowAssignee thread={thread({ assigneeId: 9, assigneeName: 'Dana Lee' })} />
      </MemoryRouter>
    );
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('DL')).toBeTruthy();
  });
});
