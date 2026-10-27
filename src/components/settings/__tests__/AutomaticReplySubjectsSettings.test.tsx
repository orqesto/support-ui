import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Settings → Workspace → Automatic Replies (`GET/PATCH /api/organizations/automatic-reply-subjects`,
 * `{ subjects: string[] }`; GET any member, PATCH org admin; ≤ 20 entries, 3–200 chars each,
 * case-insensitive duplicates removed).
 *
 * What must hold:
 * - the list shown is the one the SERVER holds — after a save, the one its 200 echoed;
 * - an admin adds and removes subjects and Save sends the whole list;
 * - a member who is not an admin sees the list read-only: no Add, no remove, no Save;
 * - the backend's 400 message is shown as it said it;
 * - a backend without the route reads as "not released yet", not as an error.
 */
const getAutomaticReplySubjects = vi.fn<() => Promise<string[]>>();
const updateAutomaticReplySubjects = vi.fn<(subjects: string[]) => Promise<string[]>>();
vi.mock('@/services/organization.service', () => ({
  organizationService: {
    getAutomaticReplySubjects: () => getAutomaticReplySubjects(),
    updateAutomaticReplySubjects: (subjects: string[]) => updateAutomaticReplySubjects(subjects),
  },
}));
const permissions = { isAdmin: false, isOrgAdmin: true };
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => permissions }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
// The other Workspace tabs are not under test; stub them so the tab test mounts only the shell.
vi.mock('../CategoriesSettings', () => ({ CategoriesSettings: () => <div>categories</div> }));
vi.mock('../LabelsSettings', () => ({ LabelsSettings: () => null }));
vi.mock('../RoutingKeysSettings', () => ({ RoutingKeysSettings: () => null }));
vi.mock('../BusinessHoursSettings', () => ({ BusinessHoursSettings: () => null }));
vi.mock('../SLAConfigSettings', () => ({ SLAConfigSettings: () => null }));
vi.mock('../SecuritySettings', () => ({ SecuritySettings: () => null }));
vi.mock('../WorkspaceDetailsSettings', () => ({ WorkspaceDetailsSettings: () => null }));
vi.mock('../OpenConversationWindowSettings', () => ({
  OpenConversationWindowSettings: () => null,
}));
vi.mock('../WorkspaceAiUsage', () => ({ WorkspaceAiUsage: () => null }));

import { AutomaticReplySubjectsSettings } from '../AutomaticReplySubjectsSettings';
import { OrganizationSettings } from '../OrganizationSettings';
import { apiError } from '@/test/apiError';

const THANKS = 'Thank you for contacting Acme!';
const RECEIVED = 'We have received your request';

const subjectList = () => screen.getByRole('list', { name: 'Automatic reply subjects' });
const shownSubjects = () =>
  within(subjectList())
    .getAllByRole('listitem')
    .map((item) => item.textContent);
const newSubject = () => screen.getByLabelText('Add a subject');
const addButton = () => screen.getByRole('button', { name: 'Add' });
const saveButton = () => screen.getByRole('button', { name: /save/i });

beforeEach(() => {
  vi.clearAllMocks();
  permissions.isAdmin = false;
  permissions.isOrgAdmin = true;
});

describe('AutomaticReplySubjectsSettings', () => {
  it('renders the saved list', async () => {
    getAutomaticReplySubjects.mockResolvedValue([THANKS, RECEIVED]);
    render(<AutomaticReplySubjectsSettings />);

    await screen.findByText(THANKS);
    expect(shownSubjects()).toEqual([THANKS, RECEIVED]);
    // Nothing changed yet: nothing to save.
    expect(saveButton()).toBeDisabled();
  });

  it('an empty list reads as such', async () => {
    getAutomaticReplySubjects.mockResolvedValue([]);
    render(<AutomaticReplySubjectsSettings />);
    expect(await screen.findByText('No subjects yet.')).toBeInTheDocument();
  });

  it('an admin adds and removes a subject; Save sends the whole list and shows what was stored', async () => {
    getAutomaticReplySubjects.mockResolvedValue([THANKS]);
    // The echo differs from what was sent on purpose: the card must show the server's list.
    updateAutomaticReplySubjects.mockResolvedValue([RECEIVED, 'Ticket received']);
    render(<AutomaticReplySubjectsSettings />);
    await screen.findByText(THANKS);

    fireEvent.change(newSubject(), { target: { value: `  ${RECEIVED}  ` } });
    fireEvent.click(addButton());
    expect(shownSubjects()).toEqual([THANKS, RECEIVED]);
    expect(newSubject()).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: `Remove ${THANKS}` }));
    expect(shownSubjects()).toEqual([RECEIVED]);

    fireEvent.click(saveButton());
    await waitFor(() => expect(updateAutomaticReplySubjects).toHaveBeenCalledWith([RECEIVED]));
    expect(await screen.findByText(/Saved\./)).toBeInTheDocument();
    expect(shownSubjects()).toEqual([RECEIVED, 'Ticket received']);
    expect(saveButton()).toBeDisabled();
  });

  it('an admin may save an empty list', async () => {
    getAutomaticReplySubjects.mockResolvedValue([THANKS]);
    updateAutomaticReplySubjects.mockResolvedValue([]);
    render(<AutomaticReplySubjectsSettings />);
    await screen.findByText(THANKS);

    fireEvent.click(screen.getByRole('button', { name: `Remove ${THANKS}` }));
    fireEvent.click(saveButton());
    await waitFor(() => expect(updateAutomaticReplySubjects).toHaveBeenCalledWith([]));
    expect(await screen.findByText('No subjects yet.')).toBeInTheDocument();
  });

  it.each([
    ['too short', 'ab', /3 to 200 characters long/],
    ['a case-insensitive duplicate', THANKS.toUpperCase(), /already in the list/],
  ])('refuses %s in words and adds nothing', async (_label, value, message) => {
    getAutomaticReplySubjects.mockResolvedValue([THANKS]);
    render(<AutomaticReplySubjectsSettings />);
    await screen.findByText(THANKS);

    fireEvent.change(newSubject(), { target: { value } });
    fireEvent.click(addButton());
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(shownSubjects()).toEqual([THANKS]);
  });

  it('a member who is not an admin sees the list read-only', async () => {
    permissions.isOrgAdmin = false;
    getAutomaticReplySubjects.mockResolvedValue([THANKS]);
    render(<AutomaticReplySubjectsSettings />);

    await screen.findByText(THANKS);
    expect(shownSubjects()).toEqual([THANKS]);
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Add a subject')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Only a workspace admin can change this list/)).toBeInTheDocument();
  });

  it("a 400 on save shows the server's message and keeps the unsaved list", async () => {
    getAutomaticReplySubjects.mockResolvedValue([THANKS]);
    updateAutomaticReplySubjects.mockRejectedValue(
      await apiError(400, { error: 'Each subject must be 3 to 200 characters' })
    );
    render(<AutomaticReplySubjectsSettings />);
    await screen.findByText(THANKS);

    fireEvent.change(newSubject(), { target: { value: RECEIVED } });
    fireEvent.click(addButton());
    fireEvent.click(saveButton());

    expect(await screen.findByText(/Each subject must be 3 to 200 characters/)).toBeInTheDocument();
    expect(screen.queryByText(/Saved\./)).not.toBeInTheDocument();
    expect(shownSubjects()).toEqual([THANKS, RECEIVED]);
  });

  it('a backend without the route reads as "not released yet", with no controls', async () => {
    getAutomaticReplySubjects.mockRejectedValue(
      await apiError(403, { error: 'Global admin access required' })
    );
    render(<AutomaticReplySubjectsSettings />);
    expect(await screen.findByText(/not available on this deployment yet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
  });

  it('a load failure is shown as an error', async () => {
    getAutomaticReplySubjects.mockRejectedValue(await apiError(500, { error: 'boom' }));
    render(<AutomaticReplySubjectsSettings />);
    expect(
      await screen.findByText(/Couldn't load the automatic reply subjects/)
    ).toBeInTheDocument();
  });
});

describe('Workspace → Automatic Replies tab', () => {
  it('a moderator can open it by deep link and reads the list', async () => {
    permissions.isOrgAdmin = false;
    getAutomaticReplySubjects.mockResolvedValue([THANKS]);
    render(
      <MemoryRouter>
        <OrganizationSettings section="automatic-replies" />
      </MemoryRouter>
    );
    expect(screen.getByText('Automatic Replies')).toBeInTheDocument();
    expect(await screen.findByText(THANKS)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
  });
});
