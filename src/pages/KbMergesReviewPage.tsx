import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { PageHeader } from '@/components/shared/PageHeader';
import { KbConsolidationReview, summarizeKbMerge } from '@/components/kb/KbConsolidationReview';
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
  const requested = searchParams.get('tab') === 'quality' ? 'quality' : 'merges';
  // No merges but quality suggestions waiting: open on those rather than on an empty tab.
  const tab: ReviewTab =
    searchParams.get('tab') === null && merges?.length === 0 && quality.length > 0
      ? 'quality'
      : requested;

  const load = useCallback(async () => {
    setError(null);
    try {
      const all = await learningService.listSuggestions('kb_quality');
      const pending = all.filter((row) => row.status === 'pending');
      setMerges(pending.filter(isKbConsolidationSuggestion));
      setQuality(pending.filter(isKbQualitySuggestion));
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
        <Tabs<ReviewTab>
          variant="simple"
          activeTab={tab}
          onTabChange={changeTab}
          tabs={[
            { id: 'merges', label: 'Merges', badge: merges?.length ?? undefined },
            { id: 'quality', label: 'Quality', badge: merges === null ? undefined : quality.length },
          ]}
        />
        {merges === null && !error ? (
          <div className="flex justify-center py-8" role="status" aria-busy="true">
            <Spinner />
          </div>
        ) : tab === 'quality' ? (
          <KbQualityList rows={quality} onChanged={() => void load()} />
        ) : merges?.length === 0 ? (
          <p className="py-8 text-sm text-center text-muted-foreground">
            No merges waiting for review.
          </p>
        ) : (
          <ul className="space-y-3" aria-label="Proposed merges">
            {(merges ?? []).map((row) => (
              <li key={row.id}>
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
