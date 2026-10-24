/**
 * Settings › Reply templates › Import from Zendesk: a macros file is previewed, macros that cannot
 * or should not be imported are skipped with a reason, and the rest are created one by one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const create = vi.fn();
vi.mock('@/services/replyTemplates.service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  replyTemplatesService: { create },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { ZendeskMacroImportDialog } = await import('../ZendeskMacroImportDialog');

/** jsdom's File has no `text()` (every browser's does), so the test file carries its own. */
const jsonFile = (content: string, name: string): File =>
  Object.assign(new File([content], name, { type: 'application/json' }), {
    text: () => Promise.resolve(content),
  });

const reply = (value: string) => [{ field: 'comment_value_html', value }];
const exportFile = jsonFile(
  JSON.stringify({
    macros: [
      {
        title: 'Order shipped',
        active: true,
        actions: reply('<p>Hi {{ticket.requester.first_name}}</p>'),
      },
      { title: 'Refund approved', active: true, actions: reply('<p>Done</p>') },
      {
        title: 'Take it',
        active: true,
        actions: [{ field: 'assignee_id', value: 'current_user' }],
      },
      { title: 'Old greeting', active: false, actions: reply('<p>Old</p>') },
      { title: 'Duplicate check', active: true, actions: reply('<p>One</p>') },
    ],
  }),
  'macros.json'
);

const onImported = vi.fn();
const renderDialog = () =>
  render(
    <ZendeskMacroImportDialog
      open
      onOpenChange={vi.fn()}
      existingNames={['refund APPROVED']}
      onImported={onImported}
    />
  );

const statusOf = (title: string) => {
  const item = screen.getByText(title).closest('li');
  if (!item) throw new Error(`no row for ${title}`);
  return within(item);
};

beforeEach(() => {
  vi.clearAllMocks();
  create.mockResolvedValue({});
});

describe('ZendeskMacroImportDialog', () => {
  it('previews each macro with why it would be skipped', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.upload(screen.getByLabelText('Zendesk macros file'), exportFile);
    expect(await screen.findByText('Order shipped')).toBeInTheDocument();
    expect(statusOf('Order shipped').getByText('Ready')).toBeInTheDocument();
    expect(statusOf('Refund approved').getByText('Name already used')).toBeInTheDocument();
    expect(statusOf('Take it').getByText('No reply text')).toBeInTheDocument();
    expect(statusOf('Take it').getByText('Not imported: assignee_id')).toBeInTheDocument();
    expect(statusOf('Old greeting').getByText('Inactive')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import 2 templates' })).toBeEnabled();

    await user.click(screen.getByLabelText('Also import inactive macros (1)'));
    expect(statusOf('Old greeting').getByText('Ready')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import 3 templates' })).toBeEnabled();
  });

  it('creates the ready macros as workspace templates and reports each result', async () => {
    create
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce({ response: { status: 409, data: { error: 'Conflict' } } });
    const user = userEvent.setup();
    renderDialog();
    await user.upload(screen.getByLabelText('Zendesk macros file'), exportFile);
    await user.click(await screen.findByRole('button', { name: 'Import 2 templates' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create).toHaveBeenNthCalledWith(1, {
      name: 'Order shipped',
      body: '<p>Hi {first_name}</p>',
      use: 'both',
      departmentId: null,
    });
    expect(
      await screen.findByText(/Imported 1\. Name already used: 1\. Failed: 0\./)
    ).toBeInTheDocument();
    expect(statusOf('Order shipped').getByText('Imported')).toBeInTheDocument();
    expect(statusOf('Duplicate check').getByText('Name already used')).toBeInTheDocument();
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it('a file that is not a macros export says so', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.upload(
      screen.getByLabelText('Zendesk macros file'),
      jsonFile('{"tickets": []}', 'tickets.json')
    );
    expect(await screen.findByText(/No macros found/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Import \d/ })).toBeNull();
  });
});
