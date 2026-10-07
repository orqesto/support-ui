/**
 * The ticket's label picker (an "Add label" button opening a search + checklist panel): ticking a
 * label assigns it, unticking removes it — the same toggle the chips' × runs — and typing a new
 * name offers "Create …", which creates the label, assigns it and closes the panel.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import ts from 'typescript';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Label } from '@/services/settings.service';
import type { Ticket } from '@/types';

const label = (id: number, name: string, color: string): Label => ({
  id,
  name,
  color,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});
const BUG = label(1, 'Bug', '#ff0000');
const BILLING = label(2, 'Billing', '#00ff00');

const getTicketLabels = vi.fn<(id: number) => Promise<Label[]>>();
const getLabels = vi.fn<() => Promise<Label[]>>();
const assignLabelToTicket = vi.fn<(ticketId: number, labelId: number) => Promise<void>>();
const removeLabelFromTicket = vi.fn<(ticketId: number, labelId: number) => Promise<void>>();
const createLabel = vi.fn<(body: { name: string; color: string }) => Promise<Label>>();

vi.mock('@/services/settings.service', () => ({
  labelService: {
    getTicketLabels: (id: number) => getTicketLabels(id),
    getLabels: () => getLabels(),
    assignLabelToTicket: (ticketId: number, labelId: number) => assignLabelToTicket(ticketId, labelId),
    removeLabelFromTicket: (ticketId: number, labelId: number) =>
      removeLabelFromTicket(ticketId, labelId),
    createLabel: (body: { name: string; color: string }) => createLabel(body),
  },
}));
vi.mock('@/services/category.service', () => ({
  categoryService: { getAll: () => Promise.resolve({ success: true, data: [] }) },
}));
vi.mock('@/services/message.service', () => ({
  messageService: { getAll: () => Promise.resolve({ data: [] }) },
}));
vi.mock('@/services/ticket.service', () => ({ ticketService: { update: () => Promise.resolve() } }));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ hasPermission: () => true }) }));
vi.mock('@/lib/logger', () => ({ logger: { error: () => {}, info: () => {} } }));
vi.mock('@/components/admin/AssignmentSelect', () => ({ AssignmentSelect: () => null }));
vi.mock('@/components/shared/RichTextEditor', () => ({ default: () => null }));
vi.mock('@/components/shared/TranslateButton', () => ({ TranslateButton: () => null }));
vi.mock('../MoveDepartmentDialog', () => ({ MoveDepartmentDialog: () => null }));
vi.mock('../TicketPanelTabs', () => ({ TicketPanelTabs: () => null }));

import { TicketDetail } from '../TicketDetail';

const ticket: Ticket = {
  id: 42,
  title: 'Parcel stuck',
  description: '',
  sender: 'a@example.com',
  status: 'open',
  priority: 'medium',
  categoryId: null,
  assigneeId: null,
  externalId: null,
  externalUrl: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const renderDetail = () =>
  render(
    <MemoryRouter>
      <TicketDetail ticket={ticket} showFullPageButton={false} />
    </MemoryRouter>
  );

const openPicker = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Add label' }));
  return screen.getByRole('combobox', { name: 'Labels' });
};

describe('TicketDetail — label picker', () => {
  beforeEach(() => {
    getTicketLabels.mockResolvedValue([BUG]);
    getLabels.mockResolvedValue([BUG, BILLING]);
    assignLabelToTicket.mockResolvedValue(undefined);
    removeLabelFromTicket.mockResolvedValue(undefined);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('ticking an unassigned label assigns THAT label (and only it); the panel stays open', async () => {
    renderDetail();
    await screen.findByText('Bug');
    await openPicker();

    fireEvent.click(screen.getByRole('option', { name: 'Billing' }));

    await waitFor(() => expect(assignLabelToTicket).toHaveBeenCalledWith(42, 2));
    expect(assignLabelToTicket).toHaveBeenCalledTimes(1);
    expect(removeLabelFromTicket).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: 'Labels' })).toBeTruthy();
    // The chip row picks it up.
    await waitFor(() => expect(screen.getByTitle('Remove Billing')).toBeTruthy());
  });

  it('a workspace with no labels yet says so, not "No matches."', async () => {
    getTicketLabels.mockResolvedValue([]);
    getLabels.mockResolvedValue([]);
    renderDetail();
    await openPicker();
    expect(await screen.findByText('No labels yet — type a name to create one.')).toBeInTheDocument();
  });

  it('while labels are still loading it says so, and a failed load says that — never "No labels yet"', async () => {
    getLabels.mockReturnValue(new Promise(() => {}));
    renderDetail();
    await openPicker();
    expect(screen.getByText('Loading labels…')).toBeInTheDocument();
    cleanup();

    getLabels.mockRejectedValue(new Error('500'));
    renderDetail();
    await openPicker();
    expect(await screen.findByText('Couldn’t load labels.')).toBeInTheDocument();
    expect(screen.queryByText(/No labels yet/)).toBeNull();
  });

  it('no "Create …" row until the label list is known (it would duplicate an existing label)', async () => {
    getLabels.mockReturnValue(new Promise(() => {}));
    renderDetail();
    const search = await openPicker();
    fireEvent.change(search, { target: { value: 'Bug' } });
    expect(screen.queryByText(/^Create /)).toBeNull();
  });

  it('a slow answer for the ticket just left does not land on the new one', async () => {
    let finishOld: (labels: Label[]) => void = () => {};
    getTicketLabels.mockImplementation((id) =>
      id === 42 ? new Promise((resolve) => (finishOld = resolve)) : Promise.resolve([BILLING])
    );
    const { rerender } = renderDetail();
    rerender(
      <MemoryRouter>
        <TicketDetail ticket={{ ...ticket, id: 43 }} showFullPageButton={false} />
      </MemoryRouter>
    );
    await screen.findByText('Billing');
    finishOld([BUG]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText('Bug')).toBeNull();
  });

  it('mounted per ticket (as both pages do), the ticket you left leaves no chips behind', async () => {
    getTicketLabels.mockImplementation((id) =>
      id === 42 ? Promise.resolve([BUG]) : new Promise(() => {})
    );
    const { rerender } = render(
      <MemoryRouter>
        <TicketDetail key={42} ticket={ticket} showFullPageButton={false} />
      </MemoryRouter>
    );
    await screen.findByTitle('Remove Bug');
    rerender(
      <MemoryRouter>
        <TicketDetail key={43} ticket={{ ...ticket, id: 43 }} showFullPageButton={false} />
      </MemoryRouter>
    );
    expect(screen.queryByTitle('Remove Bug')).toBeNull();
  });

  it('every page that renders TicketDetail keys it by the ticket id', () => {
    for (const file of ['src/pages/TicketsPage.tsx', 'src/pages/TicketDetailPage.tsx']) {
      const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const keys: string[] = [];
      const visit = (node: ts.Node) => {
        if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(source) === 'TicketDetail') {
          const key = node.attributes.properties.find((prop) => ts.isJsxAttribute(prop) && prop.name.getText(source) === 'key');
          keys.push(key && ts.isJsxAttribute(key) && key.initializer ? key.initializer.getText(source) : '');
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) expect(key).toMatch(/\.id\}$/);
    }
  });

  it('after a failed load, opening the picker retries it', async () => {
    getLabels.mockRejectedValueOnce(new Error('500')).mockResolvedValue([BUG, BILLING]);
    renderDetail();
    await waitFor(() => expect(getLabels).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 10));
    await openPicker();
    expect(await screen.findByRole('option', { name: 'Billing' })).toBeInTheDocument();
    expect(getLabels).toHaveBeenCalledTimes(2);
  });

  it('while labels cannot load it does not promise "or create"', async () => {
    getLabels.mockRejectedValue(new Error('500'));
    renderDetail();
    await openPicker();
    expect(await screen.findByText('Couldn’t load labels.')).toBeInTheDocument();
    expect(screen.queryByText('Search or create…')).toBeNull();
    expect(screen.getByText('Search…')).toBeInTheDocument();
  });

  it('unticking an assigned label removes it', async () => {
    renderDetail();
    await screen.findByTitle('Remove Bug');
    await openPicker();

    fireEvent.click(screen.getByRole('option', { name: 'Bug' }));

    await waitFor(() => expect(removeLabelFromTicket).toHaveBeenCalledWith(42, 1));
    expect(assignLabelToTicket).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTitle('Remove Bug')).toBeNull());
  });

  it('an applied label the panel does not list never reads as unticked', async () => {
    // Applied to the ticket, absent from the label list (e.g. scoped elsewhere) — listed FIRST.
    getTicketLabels.mockResolvedValue([label(9, 'Legacy', '#999999'), BUG]);
    renderDetail();
    await screen.findByTitle('Remove Bug');
    await openPicker();

    fireEvent.click(screen.getByRole('option', { name: 'Bug' }));

    await waitFor(() => expect(removeLabelFromTicket).toHaveBeenCalledWith(42, 1));
    expect(removeLabelFromTicket).toHaveBeenCalledTimes(1);
    expect(screen.getByTitle('Remove Legacy')).toBeTruthy();
  });

  it('"Create" makes the trimmed label, assigns it to the ticket and closes the panel', async () => {
    createLabel.mockResolvedValue(label(3, 'Refund', '#0000ff'));
    renderDetail();
    await screen.findByText('Bug');
    const search = await openPicker();
    expect(screen.getByText('Search or create…')).toBeTruthy();

    fireEvent.change(search, { target: { value: '  Refund ' } });
    fireEvent.click(screen.getByText('Create "Refund"'));

    await waitFor(() => expect(assignLabelToTicket).toHaveBeenCalledWith(42, 3));
    expect(createLabel).toHaveBeenCalledWith(expect.objectContaining({ name: 'Refund' }));
    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Labels' })).toBeNull());
    expect(screen.getByTitle('Remove Refund')).toBeTruthy();
  });
});
