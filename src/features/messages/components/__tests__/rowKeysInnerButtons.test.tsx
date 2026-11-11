import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MessageThread } from '@/services/message.service';

/**
 * A thread row (list card, table row) and a Kanban card open on Enter / Space. Until 2026-11-11
 * they acted on the key wherever it was pressed inside them: Enter on the copy-id button bubbled
 * to the row, whose preventDefault cancelled the button's own press and opened the thread instead.
 * Only a key pressed on the row itself opens it now.
 */

vi.mock('@/features/settings/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => null }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'COR' }));
vi.mock('@/services/message.service', () => ({ messageService: {} }));

import { MessageListItem } from '../MessageListItem';
import { KanbanCard } from '../KanbanCard';

const writeText = vi.fn().mockResolvedValue(undefined);
beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const thread = (): MessageThread =>
  ({
    threadId: 'conv_7',
    sender: 'marta@northwind.example',
    subject: 'Wrong size, need exchange',
    status: 'open',
    priority: 'high',
    lastMessageAt: new Date().toISOString(),
    messageCount: 3,
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

const copyButton = () => screen.getAllByTitle('Copy link to this thread')[0];

const surfaces = [
  ['list card', (onOpen: () => void) => <MessageListItem thread={thread()} onOpen={onOpen} />],
  [
    'table row',
    (onOpen: () => void) => <MessageListItem thread={thread()} onOpen={onOpen} density="compact" />,
  ],
  ['Kanban card', (onOpen: () => void) => <KanbanCard thread={thread()} onOpen={onOpen} />],
] as const;

describe.each(surfaces)('%s — keys', (_name, ui) => {
  it('Enter on the copy-id button does not open the thread', () => {
    const onOpen = vi.fn();
    render(<MemoryRouter>{ui(onOpen)}</MemoryRouter>);
    const pressed = fireEvent.keyDown(copyButton(), { key: 'Enter' });
    expect(onOpen).not.toHaveBeenCalled();
    // Not cancelled: the browser goes on to press the button (its click copies the link).
    expect(pressed).toBe(true);
  });

  it('Space on the copy-id button does not open the thread', () => {
    const onOpen = vi.fn();
    render(<MemoryRouter>{ui(onOpen)}</MemoryRouter>);
    fireEvent.keyDown(copyButton(), { key: ' ' });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('CONTROL: Enter on the row itself still opens the thread', () => {
    const onOpen = vi.fn();
    render(<MemoryRouter>{ui(onOpen)}</MemoryRouter>);
    const row = copyButton().closest('[role="button"][tabindex="0"]') as HTMLElement;
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
