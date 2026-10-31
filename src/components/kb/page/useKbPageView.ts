import { useEffect, useRef } from 'react';
import type { KbEngineSummaryHook } from './useKbEngineSummary';
import { kbPageViewFromSearch, kbPageViewIsExplicit, type KbPageView } from './kbPageView';

/**
 * Which KB page view to show (null while a bare URL still waits for the open-question count).
 */
export const useKbPageView = (
  canReview: boolean,
  searchParams: URLSearchParams,
  engine: Pick<KbEngineSummaryHook, 'settled' | 'summary'>
): KbPageView | null => {
  const openQuestions = engine.summary?.questions.open ?? null;
  // Which view: the URL decides (`?view=`, or a legacy status / finding); a bare URL waits for the
  // open-question count. Once chosen, a URL that names no view keeps the view (clearing a filter
  // must not jump to another view).
  // A summary slower than the 2 s wait: the view was picked without the count ("fallback"). When
  // the count then arrives, it may still move the page to Questions — but only if the person has
  // not touched the page yet (no surprise jumps under their hand).
  const lastView = useRef<KbPageView | null>(null);
  const fallbackView = useRef(false);
  const touched = useRef(false);
  const explicitView = kbPageViewIsExplicit(searchParams);
  const countedView = engine.settled
    ? kbPageViewFromSearch(searchParams, openQuestions ?? 0)
    : null;
  const revisitFallback = fallbackView.current && !touched.current && openQuestions !== null;
  const view: KbPageView | null = !canReview
    ? 'live'
    : explicitView
      ? kbPageViewFromSearch(searchParams, 0)
      : revisitFallback
        ? countedView
        : (lastView.current ?? countedView);
  useEffect(() => {
    if (!view) return;
    if (lastView.current === null || fallbackView.current)
      fallbackView.current = !explicitView && engine.summary === null;
    lastView.current = view;
  }, [view, explicitView, engine.summary]);
  useEffect(() => {
    const touch = () => {
      touched.current = true;
    };
    window.addEventListener('pointerdown', touch, true);
    window.addEventListener('keydown', touch, true);
    return () => {
      window.removeEventListener('pointerdown', touch, true);
      window.removeEventListener('keydown', touch, true);
    };
  }, []);
  return view;
};
