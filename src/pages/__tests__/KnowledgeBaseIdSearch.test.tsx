/**
 * Search by an entry's number ("KB-134"): each row shows its own number, and when the entry the
 * search names is hidden by this view's filters the page says where it is and switches to it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as KbServiceModule from '@/services/kb.service';

const getAllCalls: Array<Record<string, unknown>> = [];
let listEntries: unknown[] = [];
/** undefined ⇒ the response has NO idMatch key at all (a backend that predates it). */
let listIdMatch: unknown = undefined;

vi.mock('@/services/kb.service', async (importOriginal) => {
  const actual = await importOriginal<typeof KbServiceModule>();
  return {
    ...actual,
    kbService: {
      ...actual.kbService,
      getAll: (params: Record<string, unknown>) => {
        getAllCalls.push(params);
        return Promise.resolve({
          success: true,
          data: {
            entries: listEntries,
            pagination: { page: 1, limit: 50, total: listEntries.length, totalPages: 1 },
            ...(listIdMatch === undefined ? {} : { idMatch: listIdMatch }),
            filters: { status: params.status ?? 'all', decisionStatuses: true },
          },
        });
      },
    },
  };
});
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/knowledge-base/ConfluenceCatalogSection', () => ({
  ConfluenceCatalogSection: () => null,
}));
vi.mock('@/components/settings/DocumentationSettings', () => ({
  DocumentationSettings: () => null,
}));
vi.mock('@/components/messages/MessageSourceFilter', () => ({
  ALL_SOURCES: 'all',
  NO_SOURCE: 'none',
  MessageSourceFilter: () => null,
}));
vi.mock('@/components/admin/DepartmentBadge', () => ({ default: () => null }));
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => '' }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true, isOrgAdmin: true }),
}));
vi.mock('@/hooks/useUiFlags', () => ({ useUiFlags: () => ({ isSurfaceVisibleToMe: () => true }) }));
vi.mock('@/components/kb/KbRunNow', () => ({ KbRunNow: () => null }));
vi.mock('@/components/kb/KbExportButton', () => ({ KbExportButton: () => null }));
vi.mock('@/components/kb/KbReviewSuggestionsButton', () => ({
  KbReviewSuggestionsButton: () => null,
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [{ id: 3, name: 'Support' }] }),
  useDepartmentById: () => undefined,
}));

const { KnowledgeBasePage } = await import('../KnowledgeBasePage');
const { kbIdMatchHint } = await import('@/components/kb/KbIdMatchHint');
const { normaliseIdMatch } = await import('@/services/kb.service');

const entry = (over: Record<string, unknown>) => ({
  id: 10,
  title: 'Example entry',
  content: 'Example answer.',
  type: 'qa_pair',
  category: 'general',
  qualityScore: 0.9,
  usageCount: 0,
  approved: true,
  hidden: false,
  pendingDecision: null,
  otherPendingDecisions: 0,
  ...over,
});
const match = (over: Record<string, unknown> = {}) => ({
  id: 5,
  publicId: 'KB-134',
  type: 'qa_pair',
  status: 'pending',
  messageSourceId: null,
  inResults: false,
  ...over,
});

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <KnowledgeBasePage />
    </MemoryRouter>
  );

/** Types into the search box and presses Enter, as a person does. */
const search = (text: string) => {
  const box = screen.getByPlaceholderText('Search by ID, title, content, or category...');
  fireEvent.change(box, { target: { value: text } });
  fireEvent.keyDown(box, { key: 'Enter' });
};

beforeEach(() => {
  getAllCalls.length = 0;
  listEntries = [];
  listIdMatch = undefined;
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('KB list rows show their own number', () => {
  it('a row with a public id shows "#KB-134" in the table and the card; one without shows none', async () => {
    listEntries = [
      entry({ id: 10, publicId: 'KB-134', title: 'Numbered entry' }),
      entry({ id: 77, publicId: null, title: 'Unnumbered entry' }),
    ];
    renderAt('/knowledge-base');
    expect(await screen.findAllByText('#KB-134')).toHaveLength(2); // table row + mobile card
    expect(screen.getAllByText('Numbered entry').length).toBeGreaterThan(0);
    expect(screen.queryByText('#77')).toBeNull();
  });
});

describe('the hint when the searched entry is hidden by this view', () => {
  it('says "KB-134 is in Pending" and its button switches the status, keeping the search', async () => {
    listIdMatch = match();
    renderAt('/knowledge-base?status=approved');
    await waitFor(() => expect(getAllCalls.length).toBeGreaterThan(0));
    search('KB-134');
    expect(await screen.findByText('KB-134 is in Pending')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show KB-134' }));
    await waitFor(() => expect(getAllCalls.at(-1)).toMatchObject({ status: 'pending' }));
    expect(getAllCalls.at(-1)).toMatchObject({ search: 'KB-134' });
  });

  it('also shows when the view has OTHER results', async () => {
    listEntries = [entry({ id: 11, publicId: 'KB-1340', title: 'Mentions 134' })];
    listIdMatch = match();
    renderAt('/knowledge-base?status=approved');
    expect(await screen.findByText('KB-134 is in Pending')).toBeInTheDocument();
    expect(screen.getAllByText('Mentions 134').length).toBeGreaterThan(0);
  });

  it('names the tab when a type tab hides it, and switches the tab', async () => {
    listIdMatch = match({ status: 'approved' });
    renderAt('/knowledge-base?status=approved#document');
    expect(await screen.findByText('KB-134 is in the Q&A Pairs tab')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show KB-134' }));
    await waitFor(() => expect(getAllCalls.at(-1)).toMatchObject({ type: 'qa_pair' }));
    expect(getAllCalls.at(-1)).toMatchObject({ status: 'approved' });
  });

  it.each([
    ['no entry matched the number', null],
    ['this view already lists it', match({ inResults: true })],
    ['a backend without the field', undefined],
  ])('no hint when %s', async (_label, value) => {
    listIdMatch = value;
    listEntries = [entry({ id: 12, publicId: 'KB-9', title: 'Some entry' })];
    renderAt('/knowledge-base?status=approved');
    expect((await screen.findAllByText('Some entry')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/ is in /)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Show KB-/ })).toBeNull();
  });
});

describe('kbIdMatchHint', () => {
  const view = { status: 'all' as const, tab: 'all' as const, source: 'all', finding: false };

  it('a manual entry lives only under All', () => {
    const hint = kbIdMatchHint(
      normaliseIdMatch(match({ type: 'manual_entry', status: 'approved' })),
      {
        ...view,
        tab: 'document',
      }
    );
    expect(hint?.text).toBe('KB-134 is in the All tab');
    expect(hint?.target).toMatchObject({ tab: 'all', status: 'all', clearSource: false });
  });

  it('another source: says so and clears the source filter', () => {
    const hint = kbIdMatchHint(
      normaliseIdMatch(match({ status: 'approved', messageSourceId: 4 })),
      {
        ...view,
        source: '9',
      }
    );
    expect(hint?.text).toBe('KB-134 is from another source');
    expect(hint?.target.clearSource).toBe(true);
    // Control: the entry's own source does not hide it.
    expect(
      kbIdMatchHint(normaliseIdMatch(match({ status: 'approved', messageSourceId: 4 })), {
        ...view,
        source: '4',
      })?.target.clearSource
    ).toBe(false);
  });

  it('a finding: clears it', () => {
    const hint = kbIdMatchHint(normaliseIdMatch(match({ status: 'approved' })), {
      ...view,
      finding: true,
    });
    expect(hint?.text).toBe('KB-134 is not part of this finding');
    expect(hint?.target.clearFinding).toBe(true);
  });

  it('an entry without a public id is named by its row id', () => {
    expect(
      kbIdMatchHint(normaliseIdMatch(match({ publicId: null, id: 42 })), {
        ...view,
        status: 'approved',
      })?.text
    ).toBe('#42 is in Pending');
  });
});

describe('normaliseIdMatch (version skew)', () => {
  it.each([
    undefined,
    null,
    'KB-134',
    {},
    { ...match(), status: 'needs_decision' },
    { ...match(), inResults: 'no' },
  ])('%j ⇒ null', (value) => {
    expect(normaliseIdMatch(value)).toBeNull();
  });

  it('reads a well-formed one', () => {
    expect(normaliseIdMatch(match())).toEqual(match());
  });
});
