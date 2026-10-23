/**
 * A searched ticket list: the typed words are marked in the title, and a ticket found elsewhere
 * says where — its sender, or the passage of its description, its note or its thread (backend
 * ticketSearchMatch.ts). The same on the row, the card and the board card. A reload over rows
 * shades them; a first load shows the skeleton.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { defaultFilters } from '@/stores/ticketsStore';
import type { Ticket } from '@/types';
import { TicketCard } from '../TicketCard';
import { TicketRow } from '../TicketRow';
import { TicketTable, type TicketTableProps } from '../TicketTable';
import { buildTicketFilterKeys } from '../ticketFilterKeys';
import { TicketKanbanCard } from '../../TicketsKanbanView';

vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'TES' }));

afterEach(cleanup);

const base: Ticket = {
  id: 41,
  title: 'Reorder of the pallet labels',
  description: '<p>Nothing about it here.</p>',
  sender: 'buyer@shop.example',
  status: 'open',
  priority: 'medium',
  categoryId: null,
  assigneeId: null,
  externalId: null,
  externalUrl: null,
  createdAt: '2026-10-20T10:00:00Z',
  updatedAt: '2026-10-20T19:00:00Z',
  threadCount: 1,
  owedCount: 0,
};

const rowProps = (ticket: Ticket, highlightTerms?: string[]) => ({
  ticket,
  canManage: false,
  assignees: [],
  currentUserId: null,
  current: false,
  onOpen: vi.fn(),
  onAssign: vi.fn(),
  onRowMenu: () => null,
  highlightTerms,
});

const marks = (container: HTMLElement) =>
  [...container.querySelectorAll('mark')].map((mark) => mark.textContent);

describe.each([
  ['row', TicketRow],
  ['card', TicketCard],
] as const)('ticket %s, searched', (_name, Row) => {
  it('marks the words in the title anywhere, as the backend matched them', () => {
    const { container } = render(<Row {...rowProps(base, ['order'])} />);
    expect(marks(container)).toEqual(['order']);
  });

  it('quotes a note passage, labelled, words marked', () => {
    const ticket = {
      ...base,
      searchMatch: { field: 'note' as const, snippet: 'ships the gantry Friday' },
    };
    const { container } = render(<Row {...rowProps(ticket, ['gantry'])} />);
    expect(container.textContent).toContain('Note: ships the gantry Friday');
    expect(marks(container)).toContain('gantry');
  });

  it('quotes a thread passage, labelled; a description passage unlabelled', () => {
    const viaThread = {
      ...base,
      searchMatch: { field: 'thread' as const, snippet: 'the bollard broke' },
    };
    const { container, unmount } = render(<Row {...rowProps(viaThread, ['bollard'])} />);
    expect(container.textContent).toContain('Thread: the bollard broke');
    unmount();
    const inDescription = {
      ...base,
      searchMatch: { field: 'description' as const, snippet: 'see the capstan report' },
    };
    const second = render(<Row {...rowProps(inDescription, ['capstan'])} />);
    expect(second.container.textContent).toContain('see the capstan report');
    expect(second.container.textContent).not.toMatch(/Note:|Thread:/);
  });

  it('shows the sender when that is where it matched', () => {
    const ticket = { ...base, searchMatch: { field: 'people' as const } };
    const { container } = render(<Row {...rowProps(ticket, ['shop'])} />);
    expect(container.textContent).toContain('Sender: buyer@shop.example');
    expect(marks(container)).toContain('shop');
  });

  it('a title match, or no search, adds no line (control)', () => {
    for (const ticket of [{ ...base, searchMatch: { field: 'title' as const } }, base]) {
      const { container, unmount } = render(<Row {...rowProps(ticket)} />);
      expect(container.textContent).not.toMatch(/Note:|Thread:|Sender:/);
      unmount();
    }
  });
});

describe('board card, searched', () => {
  it('marks the title and quotes the match', () => {
    const ticket = {
      ...base,
      searchMatch: { field: 'note' as const, snippet: 'ships the gantry Friday' },
    };
    const { container } = render(
      <DndContext>
        <TicketKanbanCard
          ticket={ticket}
          colId="open"
          onOpen={vi.fn()}
          assign={{ canManage: false, assignees: [], currentUserId: null, onAssign: vi.fn() }}
          terms={['gantry', 'order']}
        />
      </DndContext>
    );
    expect(container.textContent).toContain('Note: ships the gantry Friday');
    expect(marks(container)).toEqual(expect.arrayContaining(['order', 'gantry']));
  });
});

describe('ticket table while loading', () => {
  const props = (over: Partial<TicketTableProps>): TicketTableProps => ({
    tickets: [base],
    total: 1,
    loading: false,
    filters: { ...defaultFilters, search: 'pallet' },
    sorting: { sortBy: 'updatedAt', sortOrder: 'desc' },
    keys: buildTicketFilterKeys({ assignees: [], categories: [], labels: [], jiraOn: false }),
    density: 'table',
    group: false,
    layout: 'list',
    splitAvailable: true,
    canManage: false,
    assignees: [],
    currentUserId: null,
    currentId: null,
    onOpen: vi.fn(),
    onAssign: vi.fn(),
    onRowMenu: () => null,
    onFilters: vi.fn(),
    onSort: vi.fn(),
    onDensity: vi.fn(),
    onGroup: vi.fn(),
    onLayout: vi.fn(),
    onClearFilters: vi.fn(),
    emptyAction: null,
    ...over,
  });

  it('shades the rows of a reload with "Searching…", the rows still there', () => {
    render(<TicketTable {...props({ loading: true })} />);
    expect(screen.getByLabelText('Searching…')).toBeInTheDocument();
    expect(screen.getByText('Reorder of the pallet labels')).toBeInTheDocument();
  });

  it('shades the rows only: the caption and its controls stay outside the shade', () => {
    render(<TicketTable {...props({ loading: true })} />);
    const shade = document.querySelector('[aria-busy="true"]');
    expect(shade).not.toBeNull();
    expect(shade?.textContent).toContain('Reorder of the pallet labels');
    // The caption ("Loading…" while it reloads) and its sort / density / layout controls.
    expect(shade?.textContent).not.toContain('Loading…');
    expect(screen.getByText('Loading…').closest('[aria-busy="true"]')).toBeNull();
  });

  it('a first load (no rows yet) shows the skeleton, no shade (control)', () => {
    render(<TicketTable {...props({ loading: true, tickets: [] })} />);
    expect(screen.queryByLabelText('Searching…')).toBeNull();
    expect(document.querySelector('.animate-pulse')).not.toBeNull();
  });
});
