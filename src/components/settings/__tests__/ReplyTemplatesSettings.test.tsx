/**
 * Settings › Rules › Reply templates (build spec B): everyone who reads messages sees the list;
 * "New template" needs MANAGE_REPLY_TEMPLATES; edit/archive show only on templates the server says
 * the caller may change (`canEdit`); a backend without templates shows no list.
 */
import { forwardRef } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Permission } from '@/types/roles';
import { chooseOption } from '@/test/chooseOption';

const list = vi.fn();
const create = vi.fn();
const update = vi.fn();
const archive = vi.fn();
vi.mock('@/services/replyTemplates.service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  replyTemplatesService: { list, create, update, archive },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
const perms = vi.hoisted(() => ({ granted: new Set<string>(), orgAdmin: false }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasPermission: (perm: string) => perms.granted.has(perm),
    isOrgAdmin: perms.orgAdmin,
  }),
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({
    data: [
      { id: 3, name: 'Billing' },
      { id: 4, name: 'Support' },
    ],
  }),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (state: unknown) => unknown) => select({ user: { departmentIds: [3] } }),
}));
vi.mock('@/components/shared/RichTextEditor', () => ({
  default: forwardRef(
    (
      props: { content?: string; onChange?: (html: string) => void; placeholder?: string },
      _ref
    ) => (
      <textarea
        aria-label="Template text"
        value={props.content ?? ''}
        onChange={(event) => props.onChange?.(event.target.value)}
      />
    )
  ),
}));
// The other rule tabs are not under test here.
vi.mock('../SpamRulesSettings', () => ({ SpamRulesSettings: () => <p>spam rules</p> }));
vi.mock('../DetectionRulesSettings', () => ({ DetectionRulesSettings: () => null }));
vi.mock('../KnowledgeDetectionRulesSettings', () => ({
  KnowledgeDetectionRulesSettings: () => null,
}));
vi.mock('../RoutingRulesSettings', () => ({ RoutingRulesSettings: () => null }));
vi.mock('../PriorityRulesSettings', () => ({ PriorityRulesSettings: () => null }));

const { ReplyTemplatesSettings } = await import('../ReplyTemplatesSettings');
const { RulesSettings } = await import('../RulesSettings');

const row = (over: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'Refund approved',
  body: '<p>Hi {first_name|there}</p>',
  use: 'thread',
  departmentId: 3,
  attachments: [{ id: 7, filename: 'policy.pdf', contentType: 'application/pdf', size: 3 }],
  updatedAt: '2026-10-09T10:00:00Z',
  canEdit: true,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  perms.granted = new Set([Permission.VIEW_MESSAGES]);
  perms.orgAdmin = false;
  list.mockResolvedValue({
    unavailable: false,
    templates: [
      row(),
      row({
        id: 2,
        name: 'Outage update',
        departmentId: null,
        use: 'both',
        attachments: [],
        canEdit: false,
      }),
    ],
  });
});

describe('ReplyTemplatesSettings', () => {
  it('lists each template with its use, department and files', async () => {
    render(<ReplyTemplatesSettings />);
    const items = await screen.findAllByRole('listitem');
    expect(within(items[0]).getByText('Refund approved')).toBeInTheDocument();
    expect(within(items[0]).getByText('Thread replies')).toBeInTheDocument();
    expect(within(items[0]).getByText('Billing')).toBeInTheDocument();
    expect(within(items[0]).getByText('1 file')).toBeInTheDocument();
    expect(within(items[1]).getByText('Whole workspace')).toBeInTheDocument();
    expect(within(items[1]).getByText('Both')).toBeInTheDocument();
  });

  it('edit and archive only on templates the server says the caller may change', async () => {
    render(<ReplyTemplatesSettings />);
    expect(await screen.findByRole('button', { name: 'Edit Refund approved' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive Refund approved' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Outage update' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Archive Outage update' })).toBeNull();
  });

  it('"New template" needs MANAGE_REPLY_TEMPLATES', async () => {
    const { unmount } = render(<ReplyTemplatesSettings />);
    await screen.findByText('Refund approved');
    expect(screen.queryByRole('button', { name: /New template/ })).toBeNull();
    unmount();
    perms.granted.add(Permission.MANAGE_REPLY_TEMPLATES);
    render(<ReplyTemplatesSettings />);
    expect(await screen.findByRole('button', { name: /New template/ })).toBeInTheDocument();
  });

  it('an older backend (404) shows no list and no controls', async () => {
    list.mockResolvedValue({ unavailable: true });
    perms.granted.add(Permission.MANAGE_REPLY_TEMPLATES);
    render(<ReplyTemplatesSettings />);
    expect(
      await screen.findByText('Reply templates are not available on this server yet.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New template/ })).toBeNull();
  });

  it('creates a template for one of MY departments; other departments are not offered', async () => {
    perms.granted.add(Permission.MANAGE_REPLY_TEMPLATES);
    create.mockResolvedValue(row({ id: 3 }));
    const user = userEvent.setup();
    render(<ReplyTemplatesSettings />);
    await user.click(await screen.findByRole('button', { name: /New template/ }));
    await user.type(screen.getByLabelText('Name'), 'Shipping delay');
    await user.type(screen.getByLabelText('Template text'), '<p>Sorry</p>');
    const dept = screen.getByRole('combobox', { name: 'Department' });
    await expect(chooseOption(dept, 'Support')).rejects.toBeTruthy(); // not mine
    await chooseOption(dept, 'Billing');
    await chooseOption(screen.getByRole('combobox', { name: 'Use in' }), 'Ticket replies');
    await user.click(screen.getByRole('button', { name: 'Save template' }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        { name: 'Shipping delay', body: '<p>Sorry</p>', use: 'ticket', departmentId: 3 },
        []
      )
    );
  });

  it('a workspace admin may file a template under any department', async () => {
    perms.granted.add(Permission.MANAGE_REPLY_TEMPLATES);
    perms.orgAdmin = true;
    const user = userEvent.setup();
    render(<ReplyTemplatesSettings />);
    await user.click(await screen.findByRole('button', { name: /New template/ }));
    await chooseOption(screen.getByRole('combobox', { name: 'Department' }), 'Support');
  });

  it('a duplicate name (409) says so and keeps the form open', async () => {
    perms.granted.add(Permission.MANAGE_REPLY_TEMPLATES);
    create.mockRejectedValue({ response: { status: 409, data: { error: 'Conflict' } } });
    const user = userEvent.setup();
    render(<ReplyTemplatesSettings />);
    await user.click(await screen.findByRole('button', { name: /New template/ }));
    await user.type(screen.getByLabelText('Name'), 'Refund approved');
    await user.type(screen.getByLabelText('Template text'), 'x');
    await user.click(screen.getByRole('button', { name: 'Save template' }));
    expect(
      await screen.findByText('A template with this name already exists.')
    ).toBeInTheDocument();
  });

  it('edit removes a file by id and saves the rest', async () => {
    perms.granted.add(Permission.MANAGE_REPLY_TEMPLATES);
    update.mockResolvedValue(row());
    const user = userEvent.setup();
    render(<ReplyTemplatesSettings />);
    await user.click(await screen.findByRole('button', { name: 'Edit Refund approved' }));
    await user.click(screen.getByRole('button', { name: 'Remove policy.pdf' }));
    await user.click(screen.getByRole('button', { name: 'Save template' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        1,
        {
          name: 'Refund approved',
          body: '<p>Hi {first_name|there}</p>',
          use: 'thread',
          departmentId: 3,
        },
        [7],
        []
      )
    );
  });

  it('archive asks first, then archives', async () => {
    archive.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ReplyTemplatesSettings />);
    await user.click(await screen.findByRole('button', { name: 'Archive Refund approved' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(archive).toHaveBeenCalledWith(1));
  });
});

describe('RulesSettings — the Reply templates tab', () => {
  const renderRules = (section?: string) =>
    render(
      <MemoryRouter>
        <RulesSettings section={section} />
      </MemoryRouter>
    );

  it('#rules/templates opens the tab for anyone who reads messages', async () => {
    renderRules('templates');
    expect(await screen.findByText('Refund approved')).toBeInTheDocument();
  });

  it('a permission lost while the tab is open takes its content away too', async () => {
    const user = userEvent.setup();
    const view = renderRules();
    await user.click(screen.getByText('Reply templates'));
    expect(await screen.findByText('Refund approved')).toBeInTheDocument();
    perms.granted = new Set();
    view.rerender(
      <MemoryRouter>
        <RulesSettings />
      </MemoryRouter>
    );
    expect(screen.queryByText('Refund approved')).toBeNull();
  });

  it('without VIEW_MESSAGES the tab is hidden and the deep link falls back to spam', () => {
    perms.granted = new Set();
    renderRules('templates');
    expect(screen.queryByText('Reply templates')).toBeNull();
    expect(screen.getByText('spam rules')).toBeInTheDocument();
    expect(list).not.toHaveBeenCalled();
  });
});
