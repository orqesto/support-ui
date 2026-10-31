/**
 * KB engine Stage 1, task F5: the entry drawer's version history (restore, typed refusals in
 * plain words, "Include later changes") and its case actions (Move into a case through
 * GET /cases/search with the entry's scope; Remove from case). Real services over a mocked
 * transport. All data is invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { KBEntry } from '@/services/kb.service';
import type { KbEntryVersion } from '@/services/kbEngine.types';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: api }));
vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
const viewer = vi.hoisted(() => ({ isOrgAdmin: true }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ isOrgAdmin: viewer.isOrgAdmin }),
}));
vi.mock('@/services/assignment.service', () => ({
  assignmentService: {
    getAssignableUsers: () => Promise.resolve([{ id: 3, firstName: 'Robin', lastName: 'Example' }]),
  },
}));

const { KbEntryVersions } = await import('../KbEntryVersions');
const { KbEntryCaseActions } = await import('../KbEntryCaseActions');

const ok = <T,>(data: T) => ({ data: { success: true, data } });

const live = {
  approved: true,
  approvedBy: 3,
  approvedAt: '2026-10-01T00:00:00.000Z',
  hidden: false,
  rejectedAt: null,
  rejectedBy: null,
  consolidatedInto: null,
  sourceDeleted: false,
  departmentId: 1,
};
const version = (
  number: number,
  actorKind: KbEntryVersion['actorKind'],
  reason: string,
  extra: Partial<KbEntryVersion['snapshot']> = {}
): KbEntryVersion => ({
  version: number,
  actorKind,
  actorUserId: actorKind === 'person' ? 3 : null,
  engineActionId: actorKind === 'engine' ? 40 + number : null,
  reason,
  createdAt: `2026-10-2${number}T10:00:00.000Z`,
  snapshot: { ...live, ...extra },
});

const history = [
  version(1, 'system', 'original', { textRedacted: true }),
  version(2, 'engine', 'auto:cleanPersonalData'),
  version(3, 'person', 'edit'),
  version(4, 'person', 'approve'),
];

const entry = (overrides: Partial<KBEntry> = {}): KBEntry => ({
  id: 77,
  publicId: 'KB-77',
  type: 'qa_pair',
  title: 'Do you ship on weekends?',
  content: 'No, Monday to Friday only.',
  category: 'support',
  departmentId: 1,
  messageSourceId: 5,
  qualityScore: 0.8,
  approved: true,
  hidden: false,
  usageCount: 0,
  createdAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  api.get.mockImplementation((url: string) => {
    if (url === '/api/knowledge-base/entries/77/versions')
      return Promise.resolve(ok({ versions: history }));
    if (url === '/api/knowledge-base/cases/search')
      return Promise.resolve(
        ok([
          {
            caseId: 900,
            publicId: 'KB-900',
            title: 'Shipping days',
            departmentId: 1,
            scopeKey: 's:5',
            members: 3,
          },
        ])
      );
    return Promise.reject(new Error(`unexpected ${url}`));
  });
  api.post.mockResolvedValue(ok({ restoredTo: 2, newVersion: 5 }));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  viewer.isOrgAdmin = true;
});

describe('KbEntryVersions', () => {
  it('reads nothing until opened; lists who, why and when in plain words', async () => {
    render(<KbEntryVersions entryId={77} canRestore onRestored={vi.fn()} />);
    expect(api.get).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Version history' }));
    const rows = await screen.findAllByTestId('kb-entry-version');
    expect(rows).toHaveLength(4);
    // Newest first.
    expect(rows[0]).toHaveTextContent('v4 · Robin Example');
    expect(rows[0]).toHaveTextContent('Made live');
    expect(rows[2]).toHaveTextContent('v2 · Engine');
    expect(rows[2]).toHaveTextContent('Personal details removed by the engine');
    expect(rows[3]).toHaveTextContent('v1 · System');
    // The current version and a text-removed one offer no restore.
    expect(within(rows[0]).queryByRole('button', { name: 'Restore this version' })).toBeNull();
    expect(within(rows[3]).getByText('Text removed (personal data)')).toBeInTheDocument();
    expect(within(rows[3]).queryByRole('button', { name: 'Restore this version' })).toBeNull();
    expect(within(rows[2]).getByRole('button', { name: 'Restore this version' })).toBeEnabled();
  });

  it('version restore refusal offers restore-with-later', async () => {
    const onRestored = vi.fn();
    api.post.mockRejectedValueOnce(
      Object.assign(new Error('refused'), {
        status: 409,
        data: { error: 'Changed later', code: 'LATER_CHANGES', later: [history[2], history[3]] },
      })
    );
    render(<KbEntryVersions entryId={77} canRestore onRestored={onRestored} />);
    fireEvent.click(screen.getByRole('button', { name: 'Version history' }));
    const rows = await screen.findAllByTestId('kb-entry-version');
    fireEvent.click(within(rows[2]).getByRole('button', { name: 'Restore this version' }));
    const refusal = await screen.findByTestId('kb-restore-refusal');
    expect(refusal).toHaveTextContent(/Changed later by a person on .*\(text edited\); a person/);
    expect(refusal).toHaveTextContent('Restore anyway and undo the later changes too?');
    expect(api.post).toHaveBeenLastCalledWith(
      '/api/knowledge-base/entries/77/versions/2/restore',
      {}
    );
    fireEvent.click(within(refusal).getByRole('button', { name: 'Include later changes' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenLastCalledWith(
        '/api/knowledge-base/entries/77/versions/2/restore',
        { includeLater: true }
      )
    );
    await waitFor(() => expect(onRestored).toHaveBeenCalled());
  });

  it('other refusals are plain words and offer no "Include later changes"', async () => {
    api.post.mockRejectedValueOnce(
      Object.assign(new Error('refused'), {
        status: 409,
        data: { error: 'merged', code: 'MERGED_INTO_CASE', caseId: 900 },
      })
    );
    render(<KbEntryVersions entryId={77} canRestore onRestored={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Version history' }));
    const rows = await screen.findAllByTestId('kb-entry-version');
    fireEvent.click(within(rows[2]).getByRole('button', { name: 'Restore this version' }));
    const refusal = await screen.findByTestId('kb-restore-refusal');
    expect(refusal).toHaveTextContent('It is merged into a case now');
    expect(within(refusal).queryByRole('button', { name: 'Include later changes' })).toBeNull();
  });
});

describe('KbEntryCaseActions', () => {
  const renderActions = (props: { entry?: KBEntry; canReview?: boolean } = {}) => {
    const onChanged = vi.fn();
    render(
      <MemoryRouter>
        <KbEntryCaseActions
          entry={props.entry ?? entry()}
          canReview={props.canReview ?? true}
          onChanged={onChanged}
        />
      </MemoryRouter>
    );
    return onChanged;
  };

  it('attach and detach are in the drawer for a manager, absent for a viewer', () => {
    renderActions();
    expect(screen.getByRole('button', { name: 'Move into a case' })).toBeInTheDocument();
    cleanup();
    renderActions({
      entry: entry({
        consolidation: { state: 'merged', caseId: 900, casePublicId: 'KB-900', caseExists: true },
        consolidatedInto: 900,
      }),
    });
    expect(screen.getByRole('button', { name: 'Remove from case' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move into a case' })).toBeNull();
    cleanup();
    renderActions({ canReview: false });
    expect(screen.queryByRole('button', { name: 'Move into a case' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove from case' })).toBeNull();
  });

  it('a team moderator sees no case actions for a scope they may not decide (server 403)', async () => {
    viewer.isOrgAdmin = false;
    api.get.mockImplementation((url: string) =>
      url === '/api/knowledge-base/cases/search'
        ? Promise.reject(
            Object.assign(new Error('refused'), {
              status: 403,
              data: { error: 'You may not move entries of this scope' },
            })
          )
        : Promise.reject(new Error(`unexpected ${url}`))
    );
    renderActions();
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/api/knowledge-base/cases/search', {
        params: { scopeKey: 's:5', limit: 1 },
      })
    );
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: 'Move into a case' })).toBeNull();
    cleanup();
    // The same moderator on a scope they do decide: offered after the check answers.
    api.get.mockImplementation(() => Promise.resolve(ok([])));
    renderActions({ entry: entry({ messageSourceId: null, departmentId: 4 }) });
    expect(await screen.findByRole('button', { name: 'Move into a case' })).toBeInTheDocument();
  });

  it('an org-level moderator is offered the actions without asking the server', () => {
    renderActions();
    expect(screen.getByRole('button', { name: 'Move into a case' })).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it('Move into a case searches only the cases of the entry’s scope, then attaches', async () => {
    const onChanged = renderActions();
    fireEvent.click(screen.getByRole('button', { name: 'Move into a case' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('button', { name: /Case #KB-900/ }));
    expect(api.get).toHaveBeenCalledWith('/api/knowledge-base/cases/search', {
      params: { scopeKey: 's:5', limit: 20 },
    });
    expect(screen.getByRole('dialog')).toHaveTextContent('comes back as Not live yet');
    api.post.mockResolvedValueOnce(ok({ attached: [77] }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Move' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/knowledge-base/consolidation/cases/900/attach', {
        entryIds: [77],
      })
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('a team entry with no mailbox searches by its team scope', async () => {
    renderActions({ entry: entry({ messageSourceId: null, departmentId: 4 }) });
    fireEvent.click(screen.getByRole('button', { name: 'Move into a case' }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/api/knowledge-base/cases/search', {
        params: { scopeKey: 'd:4', limit: 20 },
      })
    );
  });

  it('Remove from case confirms, then detaches', async () => {
    const onChanged = renderActions({
      entry: entry({
        consolidation: { state: 'merged', caseId: 900, casePublicId: 'KB-900', caseExists: true },
        consolidatedInto: 900,
      }),
    });
    api.post.mockResolvedValueOnce(ok({ detached: [77] }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove from case' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Not live yet');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove from case' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/knowledge-base/consolidation/cases/900/detach', {
        entryIds: [77],
      })
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
