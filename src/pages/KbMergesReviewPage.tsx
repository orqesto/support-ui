import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { KB_MERGE_SUGGESTION_PARAM } from '@/components/layout/KbReviewSection';
import { PageHeader } from '@/components/shared/PageHeader';
import { KbConsolidationReview, summarizeKbMerge } from '@/components/kb/KbConsolidationReview';
import { KbQualityCoverage } from '@/components/kb/KbQualityCoverage';
import { KbQualityList } from '@/components/kb/KbQualityList';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Tabs } from '@/components/ui/Tabs';
import { getApiErrorMessage } from '@/lib/errorMessages';
import {
  isKbConsolidationSuggestion,
  isKbQualitySuggestion,
} from '@/lib/learningSuggestionPermissions';
import { learningService, type LearningSuggestion } from '@/services/learning.service';

type ReviewTab = 'merges' | 'quality';

/**
 * Every KB suggestion still waiting for this moderator — where the bell's "Review" lands.
 * The server already filters the list to the departments this viewer may see.
 *
 *  - Merges: similar learned answers proposed as one case. Each is listed by its one-line summary;
 *    its members are read only when it is opened (mounting a review per row would fire one
 *    `/members` request per proposal on every visit — FE audit M5).
 *  - Quality: single entries the nightly review proposes to rewrite or remove (`KbQualityList`).
 */
export const KbMergesReviewPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [merges, setMerges] = useState<LearningSuggestion[] | null>(null);
  const [quality, setQuality] = useState<LearningSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<Set<number>>(new Set());
  const tab: ReviewTab = searchParams.get('tab') === 'quality' ? 'quality' : 'merges';
  // `?suggestion=<id>` (a proposal's "Review" on KB cases): open THAT proposal and bring it into view.
  const wantedRaw = Number(searchParams.get(KB_MERGE_SUGGESTION_PARAM));
  const wantedId = Number.isInteger(wantedRaw) && wantedRaw > 0 ? wantedRaw : null;
  const wantedState =
    wantedId === null || merges === null
      ? null
      : merges.some((row) => row.id === wantedId)
        ? 'found'
        : 'gone';
  useEffect(() => {
    if (wantedState !== 'found' || wantedId === null) return;
    setOpened((prev) => (prev.has(wantedId) ? prev : new Set(prev).add(wantedId)));
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(`[data-suggestion-id="${wantedId}"]`)
        ?.scrollIntoView?.({ block: 'start' })
    );
  }, [wantedState, wantedId]);
  // react-router re-creates `setSearchParams` on every URL change; read through a ref so `load`
  // stays stable — otherwise each tab switch re-ran it and re-fetched the list.
  const setParamsRef = useRef(setSearchParams);
  setParamsRef.current = setSearchParams;

  const load = useCallback(async () => {
    setError(null);
    try {
      const all = await learningService.listSuggestions('kb_quality');
      const pending = all.filter((row) => row.status === 'pending');
      const nextMerges = pending.filter(isKbConsolidationSuggestion);
      const nextQuality = pending.filter(isKbQualitySuggestion);
      setMerges(nextMerges);
      setQuality(nextQuality);
      // No tab asked for, no merges, quality suggestions waiting: open on Quality — and WRITE it
      // to the URL, once, so a later reload (a bulk remove emptying the list, a new merge arriving)
      // never flips the tab under the moderator (FE audit M1).
      setParamsRef.current(
        (current) => {
          if (current.get('tab') !== null || nextMerges.length > 0 || nextQuality.length === 0) return current;
          const params = new URLSearchParams(current);
          params.set('tab', 'quality');
          return params;
        },
        { replace: true }
      );
    } catch (err) {
      setError(getApiErrorMessage(err) ?? 'Could not load the suggestions.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const changeTab = (next: ReviewTab) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  return (
    <Layout>
      <div className="px-4 mx-auto space-y-4 w-full">
        <PageHeader
          title="Knowledge base review"
          description="Suggestions from the nightly review of learned answers. Nothing changes until you decide."
        />
        {error && <Alert variant="danger">{error}</Alert>}
        {wantedState === 'gone' && tab === 'merges' && (
          <Alert variant="info">
            That proposal is no longer waiting for review — it was decided, or it expired.
          </Alert>
        )}
        <Tabs<ReviewTab>
          variant="simple"
          activeTab={tab}
          onTabChange={changeTab}
          tabs={[
            { id: 'merges', label: 'Merges', badge: merges?.length ?? undefined },
            { id: 'quality', label: 'Quality', badge: merges === null ? undefined : quality.length },
          ]}
        />
        {merges === null && error ? null : merges === null ? (
          // A failed first load shows its error only — never "nothing waiting" under it (FE audit L4).
          <div className="flex justify-center py-8" role="status" aria-busy="true">
            <Spinner />
          </div>
        ) : tab === 'quality' ? (
          <div className="space-y-3">
            {/* How much of the KB has been checked: "no suggestions" is not "clean". */}
            <KbQualityCoverage reloadKey={quality.length} />
            <KbQualityList rows={quality} onChanged={() => void load()} />
          </div>
        ) : merges?.length === 0 ? (
          <p className="py-8 text-sm text-center text-muted-foreground">
            No merges waiting for review.
          </p>
        ) : (
          <ul className="space-y-3" aria-label="Proposed merges">
            {(merges ?? []).map((row) => (
              <li key={row.id} data-suggestion-id={row.id}>
                <Card>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex flex-wrap gap-2 justify-between items-center">
                      <span className="text-sm font-medium">
                        {summarizeKbMerge(row.payload ?? {}, row.suggestionType)}
                      </span>
                      {!opened.has(row.id) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setOpened((prev) => new Set(prev).add(row.id))}
                        >
                          Review
                        </Button>
                      )}
                    </div>
                    {opened.has(row.id) && <KbConsolidationReview suggestionId={row.id} />}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  );
};
