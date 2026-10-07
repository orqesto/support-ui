/**
 * KB department follows the mailbox (F1, F3). An entry learned from a mailbox takes its
 * department from that mailbox; only an entry with NO mailbox (an uploaded document, a manual
 * entry) gets a department picker in the editor. The service runs through the REAL api-client;
 * only the wire is fake.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { installTransport, ok, routeAbsent, type WireResponse } from '@/test/apiTransport';
import type { KBEntry } from '@/services/kb.service';
import { KBEntryEditDialog, FOLLOWS_MAILBOX_MESSAGE } from '../KBEntryEditDialog';
import { KBEntryDetail } from '../KBEntryDetail';
import { chooseOption, listOptions } from '@/test/chooseOption';

const MAILBOX_NOTE = 'from the ticket it came from — the mailbox decides where it is used';

const departments = [
  { id: 3, name: 'Support', slug: 'support', description: null, color: null, active: true },
  { id: 5, name: 'Sales', slug: 'sales', description: null, color: null, active: true },
];

const brochure: KBEntry = {
  id: 2212,
  type: 'document',
  title: 'Brochure',
  content: 'Our product range',
  category: 'docs',
  departmentId: null,
  messageSourceId: null,
  qualityScore: 0.8,
  approved: true,
  hidden: false,
  usageCount: 0,
  createdAt: '2026-10-01T09:00:00.000Z',
  sourceDeleted: false,
};
const mailboxQa: KBEntry = {
  ...brochure,
  id: 31,
  type: 'qa_pair',
  title: 'Refund?',
  content: 'Question: Where is my refund?\n\nAnswer: 5 days.',
  departmentId: 3,
  messageSourceId: 9,
  typeData: { question: 'Where is my refund?', answer: '5 days.' },
};

let patchAnswer: (body: unknown) => WireResponse;
let detailAnswer: () => unknown;
let wire: ReturnType<typeof installTransport>;
beforeEach(() => {
  patchAnswer = (body) => ok({ ...brochure, ...(body as object) });
  detailAnswer = () => brochure;
  wire = installTransport(apiClient, (request) => {
    if (request.method === 'GET' && request.path === '/api/departments') {
      return { status: 200, data: { success: true, data: departments } };
    }
    if (request.method === 'PATCH' && request.path.startsWith('/api/knowledge-base/entries/')) {
      return patchAnswer(request.body);
    }
    if (request.method === 'GET' && request.path.startsWith('/api/knowledge-base/entries/')) {
      return ok(detailAnswer());
    }
    return routeAbsent(request);
  });
});
afterEach(() => {
  cleanup();
  wire.restore();
});

const withQuery = (node: React.ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{node}</MemoryRouter>
  </QueryClientProvider>
);

const noop = () => undefined;
const drawerHandlers = {
  onApprove: noop,
  onHide: noop,
  onUnhide: noop,
  onReject: noop,
  onDelete: noop,
};

const openEditor = (entry: KBEntry) => {
  const saved: KBEntry[] = [];
  render(
    withQuery(
      <KBEntryEditDialog
        entry={entry}
        detailLoaded
        onClose={() => undefined}
        onSaved={(entrySaved) => saved.push(entrySaved)}
      />
    )
  );
  return saved;
};

const departmentSelect = () => screen.queryByLabelText('Department');
const saveButton = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Save Changes' });
// Opens the picker until the departments have loaded into it, then closes it again.
const waitForDepartments = async () => {
  const control = await screen.findByLabelText('Department');
  await waitFor(async () => expect(await listOptions(control)).toContain('Sales'));
  // Blur, not Escape: Escape would also close the dialog/drawer around it.
  fireEvent.blur(control);
  await waitFor(() => expect(screen.queryByRole('option')).toBeNull());
};
const patches = () => wire.calls('PATCH', /^\/api\/knowledge-base\/entries\//);

describe('Department in the KB entry editor (F1)', () => {
  it('a source-less entry gets a picker of the active departments', async () => {
    openEditor(brochure);
    await waitForDepartments();
    expect(departmentSelect()).not.toBeNull();
    // Nothing picked: the placeholder shows, not a department.
    expect(screen.getByText('Unassigned')).toBeTruthy();
    expect(screen.queryByText('Support')).toBeNull();
    expect(screen.queryByText(MAILBOX_NOTE)).toBeNull();
  });

  it("a mailbox entry has no picker: its ticket's department, the mailbox deciding where it is used", async () => {
    openEditor(mailboxQa);
    await waitFor(() => expect(screen.getByText('Support')).toBeTruthy());
    expect(departmentSelect()).toBeNull();
    expect(screen.getByText(MAILBOX_NOTE)).toBeTruthy();
  });

  it('an entry whose source is unknown (a detail-route shape) gets no picker', () => {
    const { messageSourceId: _unknown, ...withoutSource } = brochure;
    openEditor(withoutSource as KBEntry);
    expect(screen.getByLabelText('Title')).toBeTruthy();
    expect(departmentSelect()).toBeNull();
    expect(screen.queryByText(MAILBOX_NOTE)).toBeNull();
  });

  it('a department-only change saves, and sends ONLY departmentId', async () => {
    const saved = openEditor(brochure);
    await waitForDepartments();
    expect(saveButton().disabled).toBe(true);
    await chooseOption(departmentSelect()!, 'Sales');
    expect(saveButton().disabled).toBe(false);
    fireEvent.click(saveButton());
    await waitFor(() => expect(saved.length).toBe(1));
    expect(patches().map((call) => call.body)).toEqual([{ departmentId: 5 }]);
    expect(saved[0].departmentId).toBe(5);
  });

  it('a Q&A entry with no mailbox: a department-only change does not resend the text', async () => {
    const saved = openEditor({ ...mailboxQa, messageSourceId: null });
    await waitForDepartments();
    await chooseOption(departmentSelect()!, 'Sales');
    fireEvent.click(saveButton());
    await waitFor(() => expect(saved.length).toBe(1));
    expect(patches().map((call) => call.body)).toEqual([{ departmentId: 5 }]);
  });

  it('an unchanged department is not sent; picking the current one again is no change', async () => {
    const saved = openEditor({ ...brochure, departmentId: 3 });
    await waitForDepartments();
    expect(screen.getByText('Support')).toBeTruthy();
    expect(screen.queryByText('Unassigned')).toBeNull();
    await chooseOption(departmentSelect()!, 'Support');
    expect(saveButton().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Brochure 2026' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(saved.length).toBe(1));
    expect(patches().map((call) => call.body)).toEqual([{ title: 'Brochure 2026' }]);
  });
});

describe('The backend refusing a department change (F3)', () => {
  it('KB_DEPARTMENT_FOLLOWS_MAILBOX is said in words', async () => {
    patchAnswer = () => ({
      status: 400,
      data: {
        success: false,
        error: 'departmentId cannot be set on a mailbox entry',
        code: 'KB_DEPARTMENT_FOLLOWS_MAILBOX',
      },
    });
    const saved = openEditor(brochure);
    await waitForDepartments();
    await chooseOption(departmentSelect()!, 'Sales');
    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByText(FOLLOWS_MAILBOX_MESSAGE)).toBeTruthy());
    expect(FOLLOWS_MAILBOX_MESSAGE).toBe(
      'This entry comes from a mailbox; its department follows the mailbox.'
    );
    expect(saved).toEqual([]);
  });

  it('any other error keeps the server message', async () => {
    patchAnswer = () => ({
      status: 403,
      data: { success: false, error: 'You are not a member of that department' },
    });
    openEditor(brochure);
    await waitForDepartments();
    await chooseOption(departmentSelect()!, 'Sales');
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(screen.getByText('You are not a member of that department')).toBeTruthy()
    );
    expect(screen.queryByText(FOLLOWS_MAILBOX_MESSAGE)).toBeNull();
  });
});

describe('The drawer keeps the list row source for the editor', () => {
  it('the detail route omits messageSourceId: the list row says no mailbox ⇒ picker', async () => {
    const { messageSourceId: _omitted, ...detailShape } = brochure;
    detailAnswer = () => detailShape;
    render(
      withQuery(<KBEntryDetail entry={brochure} onClose={noop} canReview {...drawerHandlers} />)
    );
    fireEvent.click(await screen.findByRole('button', { name: /Edit/ }));
    await waitForDepartments();
    expect(departmentSelect()).not.toBeNull();
  });

  it('the list row says a mailbox ⇒ no picker, even though the detail omits it', async () => {
    const { messageSourceId: _omitted, ...detailShape } = mailboxQa;
    detailAnswer = () => detailShape;
    render(
      withQuery(<KBEntryDetail entry={mailboxQa} onClose={noop} canReview {...drawerHandlers} />)
    );
    fireEvent.click(await screen.findByRole('button', { name: /Edit/ }));
    await waitFor(() => expect(screen.getByText(MAILBOX_NOTE)).toBeTruthy());
    expect(departmentSelect()).toBeNull();
  });
});
