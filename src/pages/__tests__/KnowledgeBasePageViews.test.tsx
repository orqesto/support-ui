/**
 * KB engine Stage 1, task F3: the Knowledge Base page opens on Questions, has three views
 * (Questions · Live answers · Engine activity), names statuses in agent words, shows at most five
 * filter controls, and its Documentation tab moved to Settings › AI.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type * as KbServiceModule from '@/services/kb.service';
import type * as ActivityModule from '@/components/kb/activity/KbEngineActivity';
import type { KbEngineSummary, KbQuestion } from '@/services/kbEngine.types';
import type { KbConsolidationRunState } from '@/services/kbConsolidation.service';

const state = vi.hoisted(() => ({
  canManageKb: true,
  total: 3,
  summary: null as KbEngineSummary | null,
  summaryFails: false,
  summaryHangs: false,
  summaryLate: null as Promise<KbEngineSummary> | null,
  summaryCalls: 0,
  questionsCalls: 0,
  runState: null as KbConsolidationRunState | null,
  departments: [] as { id: number; name: string; active?: boolean }[],
  teamsEnabled: undefined as boolean | undefined,
  getAllCalls: [] as Array<Record<string, unknown>>,
  questions: [] as KbQuestion[],
}));

const summaryOf = (open: number, killedAll = false): KbEngineSummary => ({
  findings: null,
  findingsComputedAt: null,
  questions: { open, olderThan7d: 0 },
  week: {
    actions: 41,
    undone: 0,
    byAction: {
      remove: { applied: 0, undone: 0 },
      hold: { applied: 0, undone: 0 },
      cleanPersonalData: { applied: 0, undone: 0 },
      approveMined: { applied: 0, undone: 0 },
      approveCaptures: { applied: 0, undone: 0 },
      releaseHold: { applied: 0, undone: 0 },
    },
  },
  killed: { all: killedAll, actions: [] },
});

vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'ACM' }));
vi.mock('@/services/kb.service', async (importOriginal) => {
  const actual = await importOriginal<typeof KbServiceModule>();
  return {
    ...actual,
    kbService: {
      ...actual.kbService,
      getAll: (params: Record<string, unknown>) => {
        state.getAllCalls.push(params);
        const entries = Array.from({ length: state.total }, (_, index) => ({
          id: index + 1,
          title: `Entry ${index + 1}`,
          content: 'How to reset a password',
          type: 'qa_pair',
          approved: true,
          hidden: false,
          createdAt: '2026-10-01T00:00:00Z',
          updatedAt: '2026-10-01T00:00:00Z',
        }));
        return Promise.resolve({
          data: {
            entries,
            pagination: { page: 1, limit: 50, total: state.total, totalPages: 1 },
            filters: { finding: params.finding, statusApplied: true },
          },
        });
      },
    },
  };
});
vi.mock('@/services/kbEngine.service', () => ({
  getEngineSummary: () => {
    state.summaryCalls += 1;
    return state.summaryLate && state.summaryCalls === 1
      ? state.summaryLate
      : state.summaryHangs
        ? new Promise<never>(() => undefined)
        : state.summaryFails || !state.summary
          ? Promise.reject(new Error('no summary'))
          : Promise.resolve(state.summary);
  },
  getKbQuestions: () => {
    state.questionsCalls += 1;
    return Promise.resolve({
      items: state.questions,
      total: state.questions.length,
      nextCursor: null,
      olderThan7d: 0,
    });
  },
  answerKbQuestion: (id: number, choice: string) =>
    Promise.resolve({ suggestionId: id, kind: 'merge', choice, result: {} }),
}));
// The real Engine activity, plus a test button standing in for an undo or rollback inside it.
vi.mock('@/components/kb/activity/KbEngineActivity', async (importOriginal) => {
  const actual = await importOriginal<typeof ActivityModule>();
  const Real = actual.KbEngineActivity;
  return {
    ...actual,
    KbEngineActivity: (props: Parameters<typeof Real>[0]) => (
      <>
        <Real {...props} />
        <button type="button" onClick={() => props.onChanged?.()}>
          test: engine change undone
        </button>
      </>
    ),
  };
});
vi.mock('@/services/kbConsolidation.service', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    kbConsolidationService: { getRunState: () => Promise.resolve(state.runState) },
  };
});
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: () => Promise.reject(new Error('not in this test')) },
}));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/knowledge-base/ConfluenceCatalogSection', () => ({
  ConfluenceCatalogSection: () => <p>confluence catalog</p>,
}));
vi.mock('@/components/settings/DocumentationSettings', () => ({
  DocumentationSettings: () => <p>documentation settings</p>,
}));
vi.mock('@/components/messages/MessageSourceFilter', () => ({
  ALL_SOURCES: 'all',
  NO_SOURCE: 'none',
  MessageSourceFilter: () => <p>source filter</p>,
}));
vi.mock('@/components/admin/DepartmentBadge', () => ({ default: () => null }));
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => '' }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasPermission: () => state.canManageKb,
    hasAnyPermission: () => state.canManageKb,
    isOrgAdmin: state.canManageKb,
  }),
}));
vi.mock('@/hooks/useUiFlags', () => ({ useUiFlags: () => ({ isSurfaceVisibleToMe: () => true }) }));
vi.mock('@/hooks/useAutoActionsAvailable', () => ({
  useAutoActionsAvailable: () => true,
  resetAutoActionsAvailability: () => undefined,
}));
vi.mock('@/hooks/useBackendVersion', () => ({ useBackendVersion: () => ({ data: undefined }) }));
vi.mock('@/components/kb/KbExportButton', () => ({ KbExportButton: () => <p>export</p> }));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: state.departments, teamsEnabled: state.teamsEnabled }),
  useDepartmentById: () => undefined,
}));
const nothing = () => null;
vi.mock('@/components/settings/PromptsSettings', () => ({ PromptsSettings: nothing }));
vi.mock('@/components/settings/AutoReplyConfiguration', () => ({
  AutoReplyConfiguration: nothing,
}));
vi.mock('@/components/settings/AiDraftsSettings', () => ({ AiDraftsSettings: nothing }));
vi.mock('@/components/settings/LeadQualificationSection', () => ({
  LeadQualificationSection: nothing,
}));
vi.mock('@/components/settings/LearningNotificationsInbox', () => ({
  LearningNotificationsInbox: nothing,
}));
vi.mock('@/components/settings/LearningEvidenceCard', () => ({ LearningEvidenceCard: nothing }));
vi.mock('@/components/settings/LearningSuggestionsSettings', () => ({
  LearningSuggestionsSettings: nothing,
}));
vi.mock('@/components/settings/LearningTrustSettings', () => ({ LearningTrustSettings: nothing }));
vi.mock('@/components/kb/autoActions/KbAutoActionsPanel', () => ({ KbAutoActionsPanel: nothing }));

const { KnowledgeBasePage } = await import('../KnowledgeBasePage');
const { AIConfigSettings } = await import('@/components/settings/AIConfigSettings');
const { KB_FILTER_STATUS_LABEL } = await import('@/components/kb/KbStatusFilter');
const { kbPageViewFromSearch } = await import('@/components/kb/page/kbPageView');

const Where = () => {
  const location = useLocation();
  return (
    <output data-testid="where">{`${location.pathname}${location.search}${location.hash}`}</output>
  );
};

const SettingsProbe = () => {
  const location = useLocation();
  return <AIConfigSettings section={location.hash.replace('#ai/', '')} />;
};

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/knowledge-base" element={<KnowledgeBasePage />} />
        <Route path="/settings" element={<SettingsProbe />} />
      </Routes>
      <Where />
    </MemoryRouter>
  );

const viewTabs = () => screen.getByRole('group', { name: 'Knowledge base view' });
const pressedView = () =>
  within(viewTabs())
    .getAllByRole('button')
    .find((button) => button.getAttribute('aria-pressed') === 'true')?.textContent;
const filterControls = () => document.querySelectorAll('[data-kb-filter]').length;

beforeEach(() => {
  state.canManageKb = true;
  state.total = 3;
  state.summary = summaryOf(2);
  state.summaryFails = false;
  state.summaryHangs = false;
  state.summaryLate = null;
  state.summaryCalls = 0;
  state.questionsCalls = 0;
  state.runState = null;
  state.departments = [];
  state.teamsEnabled = undefined;
  state.getAllCalls.length = 0;
  state.questions = [];
});
afterEach(cleanup);

describe('Knowledge Base page: three views', () => {
  it('answering a question drops the heading, the tab and the digest together', async () => {
    state.questions = [
      {
        suggestionId: 7,
        kind: 'entry_review',
        departmentId: null,
        prompt: 'Engine suggests removing this answer.',
        answers: [
          {
            entryId: 70,
            label: 'A',
            question: 'Where is my parcel?',
            answer: 'Look it up with the tracking link.',
            evidence: { threads: 0, customers: 0, firstAt: null, lastAt: null, countries: [] },
          },
        ],
        ruledOut: [],
        guess: null,
        usedInDraftsLast7d: null,
        choices: [
          { key: 'keep', label: 'Keep as it is', needsText: false },
          { key: 'remove', label: 'Remove', needsText: false },
        ],
        openedAt: '2026-10-29T10:00:00Z',
      },
    ];
    renderAt('/knowledge-base');
    expect(
      await screen.findByRole('heading', { name: 'Questions for you (2)' })
    ).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /Remove/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save answer' }));
    expect(
      await screen.findByRole('heading', { name: 'Questions for you (1)' })
    ).toBeInTheDocument();
    expect(pressedView()).toBe('Questions (1)');
    expect(
      screen.getByText('Engine did 41 things this week, 0 undone, 1 questions for you')
    ).toBeInTheDocument();
  });

  it('opens on Questions when there are open questions', async () => {
    renderAt('/knowledge-base');
    expect(
      await screen.findByRole('heading', { name: 'Questions for you (2)' })
    ).toBeInTheDocument();
    expect(pressedView()).toBe('Questions (2)');
    expect(screen.getByTestId('kb-questions-slot')).toBeInTheDocument();
    // Engine activity sits collapsed under the card.
    expect(screen.getByTestId('kb-engine-activity-slot')).toHaveAttribute('data-expanded', 'false');
    expect(
      screen.getByText('Engine did 41 things this week, 0 undone, 2 questions for you')
    ).toBeInTheDocument();
    // The list is not read for a view that does not show it.
    expect(state.getAllCalls).toHaveLength(0);
  });

  it('opens on Live answers when there are none and shows "Nothing needs you" on the Questions tab', async () => {
    state.summary = summaryOf(0);
    renderAt('/knowledge-base');
    await waitFor(() => expect(pressedView()).toBe('Live answers'));
    await waitFor(() => expect(state.getAllCalls.length).toBeGreaterThan(0));
    fireEvent.click(within(viewTabs()).getByRole('button', { name: 'Questions (0)' }));
    expect(await screen.findByText('Nothing needs you')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/knowledge-base?view=questions');
  });

  it('legacy ?status=needs_decision opens Questions', async () => {
    renderAt('/knowledge-base?status=needs_decision');
    expect(
      await screen.findByRole('heading', { name: 'Questions for you (2)' })
    ).toBeInTheDocument();
    expect(pressedView()).toBe('Questions (2)');
    expect(kbPageViewFromSearch(new URLSearchParams('status=suggested_change'), 0)).toBe(
      'questions'
    );
  });

  it('legacy ?finding=raw_email&departmentId=3 opens Live with the finding banner', async () => {
    renderAt('/knowledge-base?finding=raw_email&departmentId=3#qa_pair');
    await waitFor(() => expect(pressedView()).toBe('Live answers'));
    expect(
      await screen.findByText(/Learned entries that are raw emails, not questions/)
    ).toBeInTheDocument();
    expect(state.getAllCalls.at(-1)).toMatchObject({ status: 'all', type: 'qa_pair' });
    expect(kbPageViewFromSearch(new URLSearchParams('status=approved'), 5)).toBe('live');
    expect(kbPageViewFromSearch(new URLSearchParams('view=activity&status=approved'), 5)).toBe(
      'activity'
    );
  });

  it('the Engine activity tab shows the panel expanded', async () => {
    renderAt('/knowledge-base?view=activity');
    expect(await screen.findByTestId('kb-engine-activity-slot')).toHaveAttribute(
      'data-expanded',
      'true'
    );
  });

  it('at most 5 filter controls visible by default', async () => {
    state.departments = [
      { id: 1, name: 'Support' },
      { id: 2, name: 'Sales' },
    ];
    state.teamsEnabled = true;
    renderAt('/knowledge-base?view=live');
    await waitFor(() => expect(state.getAllCalls.length).toBeGreaterThan(0));
    expect(filterControls()).toBe(5);
    for (const kind of ['view', 'search', 'team', 'type', 'more'])
      expect(document.querySelector(`[data-kb-filter="${kind}"]`)).not.toBeNull();
    // Status, source and finding wait behind "More filters".
    expect(screen.queryByText('source filter')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /More filters/ }));
    expect(screen.getByText('source filter')).toBeInTheDocument();
    // Live answers lists live answers unless another status is picked.
    expect(screen.getByRole('button', { name: 'Live' })).toHaveAttribute('aria-pressed', 'true');

    cleanup();
    renderAt('/knowledge-base');
    await screen.findByRole('heading', { name: 'Questions for you (2)' });
    expect(filterControls()).toBeLessThanOrEqual(5);
  });

  it('status labels use agent words', async () => {
    expect(KB_FILTER_STATUS_LABEL).toEqual({
      approved: 'Live',
      pending: 'Not live yet',
      needs_decision: 'Question for you',
      suggested_change: 'Engine suggests a change',
      set_aside: 'Skipped by the engine',
      auto_removed: 'Removed by the engine',
      auto_changed: 'Changed by the engine',
      hidden: 'Hidden',
      rejected: 'Turned down',
      all: 'Everything',
    });
    renderAt('/knowledge-base?view=live&status=set_aside');
    expect(await screen.findByRole('button', { name: 'Skipped by the engine' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    const pageText = (document.body.textContent ?? '').replace(
      screen.getByTestId('where').textContent ?? '',
      ''
    );
    expect(pageText).not.toMatch(/set_aside|auto_removed/);
    // A status picked on Live answers keeps the page there, even one that alone opens Questions.
    fireEvent.click(screen.getByRole('button', { name: 'Question for you' }));
    await waitFor(() =>
      expect(state.getAllCalls.at(-1)).toMatchObject({ status: 'needs_decision' })
    );
    expect(pressedView()).toBe('Live answers');
  });

  it('Live answers lists live answers by default; Everything is sent as status=all', async () => {
    renderAt('/knowledge-base?view=live');
    await waitFor(() => expect(state.getAllCalls.at(-1)).toMatchObject({ status: 'approved' }));
    // The default is not a filter: no count on "More filters", and the panel stays closed.
    expect(screen.getByRole('button', { name: 'More filters' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'More filters' }));
    fireEvent.click(screen.getByRole('button', { name: 'Everything' }));
    await waitFor(() => expect(state.getAllCalls.at(-1)).toMatchObject({ status: 'all' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/knowledge-base?view=live&status=all');
  });

  it('a finding link lists every entry of its finding (status all), not only live ones', async () => {
    renderAt('/knowledge-base?finding=raw_email&departmentId=3');
    await waitFor(() =>
      expect(state.getAllCalls.at(-1)).toMatchObject({ status: 'all', finding: 'raw_email' })
    );
  });

  it('a bare URL whose summary does not answer opens Live answers after 2 s, not a spinner', async () => {
    state.summaryHangs = true;
    renderAt('/knowledge-base');
    expect(state.getAllCalls).toHaveLength(0);
    await waitFor(() => expect(pressedView()).toBe('Live answers'), { timeout: 3500 });
    await waitFor(() => expect(state.getAllCalls.length).toBeGreaterThan(0));
    expect(pressedView()).toBe('Live answers');
  });

  const lateSummary = () => {
    let arrive: (summary: KbEngineSummary) => void = () => undefined;
    state.summaryLate = new Promise<KbEngineSummary>((resolve) => {
      arrive = resolve;
    });
    return async (summary: KbEngineSummary) => {
      await act(async () => {
        arrive(summary);
        await Promise.resolve();
      });
    };
  };

  it('a summary later than 2 s that shows open questions moves the untouched page to Questions', async () => {
    const arrive = lateSummary();
    renderAt('/knowledge-base');
    await waitFor(() => expect(pressedView()).toBe('Live answers'), { timeout: 3500 });
    await arrive(summaryOf(2));
    await waitFor(() => expect(pressedView()).toBe('Questions (2)'));
  });

  it('a late summary does not move a page the person already used', async () => {
    const arrive = lateSummary();
    renderAt('/knowledge-base');
    await waitFor(() => expect(pressedView()).toBe('Live answers'), { timeout: 3500 });
    fireEvent.pointerDown(document.body);
    await arrive(summaryOf(2));
    await screen.findByText('Questions (2)');
    expect(pressedView()).toBe('Live answers');
  });

  it('an undo or rollback in Engine activity re-reads the counts and the Questions queue', async () => {
    renderAt('/knowledge-base');
    await screen.findByRole('heading', { name: 'Questions for you (2)' });
    await waitFor(() => expect(state.questionsCalls).toBeGreaterThan(0));
    const summaries = state.summaryCalls;
    const queues = state.questionsCalls;
    state.summary = summaryOf(3);
    fireEvent.click(screen.getByRole('button', { name: 'test: engine change undone' }));
    expect(
      await screen.findByRole('heading', { name: 'Questions for you (3)' })
    ).toBeInTheDocument();
    expect(state.summaryCalls).toBe(summaries + 1);
    await waitFor(() => expect(state.questionsCalls).toBeGreaterThan(queues));
  });

  it('Documentation tab is gone from the KB page and present in Settings › AI', async () => {
    renderAt('/knowledge-base?view=live');
    await waitFor(() => expect(state.getAllCalls.length).toBeGreaterThan(0));
    expect(screen.queryByText(/Documentation/)).toBeNull();
    expect(screen.queryByText('documentation settings')).toBeNull();
    cleanup();

    renderAt('/knowledge-base#documentation');
    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent('/settings#ai/documentation')
    );
    expect(await screen.findByText('documentation settings')).toBeInTheDocument();
    expect(screen.getByText('confluence catalog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Documentation/ })).toBeInTheDocument();
  });

  it('first run: no entries shows "The engine is still learning"', async () => {
    state.summary = summaryOf(0);
    state.total = 0;
    renderAt('/knowledge-base');
    expect(await screen.findByText('The engine is still learning')).toBeInTheDocument();
    expect(screen.queryByText('No entries found')).toBeNull();
  });

  it('a filtered empty list is not a first run', async () => {
    state.total = 0;
    renderAt('/knowledge-base?view=live&status=hidden');
    await waitFor(() => expect(state.getAllCalls.length).toBeGreaterThan(0));
    expect(screen.queryByText('The engine is still learning')).toBeNull();
  });

  it('engine off shows a one-line notice with a link to Automatic actions', async () => {
    state.summary = summaryOf(1, true);
    renderAt('/knowledge-base');
    const notice = await screen.findByTestId('kb-engine-off');
    expect(notice).toHaveTextContent('The engine is switched off');
    expect(within(notice).getByRole('link', { name: 'Automatic actions →' })).toHaveAttribute(
      'href',
      '/settings#ai/automatic-actions'
    );
  });

  it('engine off also when nightly scoring cannot run (kb.quality_review_enabled off)', async () => {
    state.runState = {
      runningSince: null,
      last: null,
      canRun: true,
      switches: {
        ownKey: false,
        selfHosted: false,
        globalApplies: true,
        enabled: { on: true, from: 'global' },
        dryRun: { on: false, from: 'default' },
        quality: { on: false, from: 'default' },
      },
    };
    renderAt('/knowledge-base');
    const notice = await screen.findByTestId('kb-engine-off');
    // Agent words only: the flag and where to switch it are on the Automatic actions page.
    expect(notice).toHaveTextContent(
      "The engine's nightly check is off, so nothing is reviewed automatically. Automatic actions →"
    );
    expect(notice.textContent).not.toMatch(/kb\.|Console|Feature flags|platform admin/);
    expect(within(notice).getByRole('link', { name: 'Automatic actions →' })).toBeInTheDocument();
  });

  it('no notice while the engine runs', async () => {
    renderAt('/knowledge-base');
    await screen.findByRole('heading', { name: 'Questions for you (2)' });
    expect(screen.queryByTestId('kb-engine-off')).toBeNull();
  });

  it('a summary that fails opens Live answers, and someone without KB rights sees only Live answers', async () => {
    state.summaryFails = true;
    renderAt('/knowledge-base');
    await waitFor(() => expect(pressedView()).toBe('Live answers'));
    cleanup();

    state.canManageKb = false;
    renderAt('/knowledge-base?status=needs_decision');
    await waitFor(() => expect(state.getAllCalls.length).toBeGreaterThan(0));
    expect(screen.queryByRole('group', { name: 'Knowledge base view' })).toBeNull();
    expect(screen.queryByTestId('kb-questions-slot')).toBeNull();
  });
});
