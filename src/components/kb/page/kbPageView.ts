/**
 * KB engine Stage 1: the Knowledge Base page has three views. Which one a URL opens, so old links
 * (`?status=…`, `?finding=…`, the bell's and the cases page's) still land in the right place.
 */
import type { KbFilterStatus } from '@/components/kb/KbStatusFilter';
import { kbFindingFromSearch, type KbFindingFilter } from '@/lib/kbFinding';
import type { KbListFilters } from '@/services/kbEngine.service';

export type KbPageView = 'questions' | 'live' | 'activity';

/**
 * The status Live answers lists when the URL names none: live answers ('approved'), owner
 * 2026-10-30. A finding link lists every entry of its finding ('all'): those are mostly not live.
 * Any other status (Everything included) comes from More filters › Status and is in the URL.
 */
export const liveDefaultStatus = (search: URLSearchParams): KbFilterStatus =>
  kbFindingFromSearch(search) ? 'all' : 'approved';

export const KB_PAGE_VIEWS: readonly KbPageView[] = ['questions', 'live', 'activity'];

export const KB_PAGE_VIEW_LABEL: Record<KbPageView, string> = {
  questions: 'Questions',
  live: 'Live answers',
  activity: 'Engine activity',
};

/** The statuses whose rows are now questions: a link to them opens the Questions view. */
const QUESTION_STATUSES = ['needs_decision', 'suggested_change'];

/**
 * The view a URL opens:
 * - `?view=` wins;
 * - a legacy `?status=needs_decision|suggested_change` opens Questions;
 * - any other `?status=`, a `?finding=` or an entry (`?id=`) opens Live answers, filtered;
 * - nothing: Questions when there are open questions, otherwise Live answers.
 */
export const kbPageViewFromSearch = (
  search: URLSearchParams,
  openQuestions: number
): KbPageView => {
  const view = search.get('view');
  if (KB_PAGE_VIEWS.includes(view as KbPageView)) return view as KbPageView;
  // "Decide in Knowledge Base" links: a question's card, or an entry's drawer.
  if (search.get('question')) return 'questions';
  if (search.get('entry')) return 'live';
  const status = search.get('status');
  if (status && QUESTION_STATUSES.includes(status)) return 'questions';
  if (status || search.get('finding') || search.get('id')) return 'live';
  return openQuestions > 0 ? 'questions' : 'live';
};

/**
 * Whether the URL alone decides the view (no need to wait for the open-question count). The page
 * waits for the count only when this is false.
 */
export const kbPageViewIsExplicit = (search: URLSearchParams): boolean =>
  KB_PAGE_VIEWS.includes(search.get('view') as KbPageView) ||
  ['status', 'finding', 'id', 'question', 'entry'].some((key) => Boolean(search.get(key)));

/** The same search on another view: `view` set, a legacy question status dropped. */
export const kbSearchForView = (search: URLSearchParams, view: KbPageView): string => {
  const next = new URLSearchParams(search);
  next.set('view', view);
  if (view !== 'questions') next.delete('question');
  if (view !== 'live') {
    next.delete('entry');
    // The list's own filters mean nothing on the other views.
    next.delete('status');
    next.delete('finding');
    next.delete('departmentId');
  } else if (QUESTION_STATUSES.includes(next.get('status') ?? '')) {
    next.delete('status');
  }
  return next.toString();
};

const positiveInt = (value: string | null): number | undefined => {
  const parsed = Number(value);
  return value && Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

/** `?question=<suggestionId>`: the question whose card the queue starts at. */
export const kbQuestionFromSearch = (search: URLSearchParams): number | undefined =>
  positiveInt(search.get('question'));

/**
 * The team an old link names (`?status=needs_decision&departmentId=3`) carries over to the
 * Questions view, which has no `departmentId` filter of its own: it asks for that team's questions.
 */
export const kbQuestionsTeamFromSearch = (search: URLSearchParams): number | undefined =>
  positiveInt(search.get('departmentId'));

/** The export's filters: exactly what the list asks for (see `fetchEntries` and the team header). */
export const kbExportFilters = (list: {
  status: KbFilterStatus;
  finding: KbFindingFilter | null;
  teams: number[];
  source: KbListFilters['source'];
  type: string;
  search: string;
}): KbListFilters => ({
  status: list.status,
  finding: list.finding?.finding,
  departmentId: list.finding?.departmentId,
  departmentIds: list.teams.length ? list.teams : undefined,
  source: list.source,
  type: list.type,
  search: list.search,
});

/** "Failed to Hide", with the error's own message: the same words for every entry action. */
export const entryFailureAlert = (verb: string, title: string, error: unknown) => ({
  open: true,
  title: `Failed to ${title}`,
  description: error instanceof Error ? error.message : `Failed to ${verb} KB entry`,
  variant: 'error' as const,
});
