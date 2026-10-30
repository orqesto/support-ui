/**
 * KB engine Stage 1: the Knowledge Base page has three views. Which one a URL opens, so old links
 * (`?status=…`, `?finding=…`, the bell's and the cases page's) still land in the right place.
 */
export type KbPageView = 'questions' | 'live' | 'activity';

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
  ['status', 'finding', 'id'].some((key) => Boolean(search.get(key)));

/** The same search on another view: `view` set, a legacy question status dropped. */
export const kbSearchForView = (search: URLSearchParams, view: KbPageView): string => {
  const next = new URLSearchParams(search);
  next.set('view', view);
  if (view !== 'live') {
    // The list's own filters mean nothing on the other views.
    next.delete('status');
    next.delete('finding');
    next.delete('departmentId');
  } else if (QUESTION_STATUSES.includes(next.get('status') ?? '')) {
    next.delete('status');
  }
  return next.toString();
};
