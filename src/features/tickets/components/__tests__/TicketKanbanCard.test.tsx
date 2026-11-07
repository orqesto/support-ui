import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import type { Ticket } from '@/types';
import { TicketKanbanCard } from '../TicketsKanbanView';

vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'TES' }));

const ticket: Ticket = {
  id: 1182,
  title: 'Checkout fails at the 3-D Secure step',
  description: '',
  sender: 'anna@example.com',
  status: 'open',
  priority: 'high',
  categoryId: null,
  categoryName: null,
  assigneeId: null,
  assigneeName: null,
  externalId: null,
  externalUrl: null,
  createdAt: '2026-10-20T10:00:00Z',
  updatedAt: '2026-10-20T19:00:00Z',
};

const renderCard = (over: Partial<Ticket> = {}) =>
  render(
    <DndContext>
      <TicketKanbanCard
        ticket={{ ...ticket, ...over }}
        colId="open"
        onOpen={vi.fn()}
        assign={{ canManage: false, assignees: [], currentUserId: null, onAssign: vi.fn() }}
      />
    </DndContext>
  );

describe('TicketKanbanCard', () => {
  it('is named by the ID it draws once the ticket has one', () => {
    renderCard({ reference: 'SUP-T-42' });
    expect(screen.getByRole('button', { name: 'Open ticket TES-SUP-T-42' })).toBeInTheDocument();
    expect(screen.getByText('TES-SUP-T-42')).toBeInTheDocument();
  });

  it('falls back to #id before the ticket has a number', () => {
    renderCard();
    expect(screen.getByRole('button', { name: 'Open ticket #1182' })).toBeInTheDocument();
  });
});
