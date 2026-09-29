import { useCallback, useEffect, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { PageHeader } from '@/components/shared/PageHeader';
import { KbConsolidationReview, summarizeKbMerge } from '@/components/kb/KbConsolidationReview';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { isKbConsolidationSuggestion } from '@/lib/learningSuggestionPermissions';
import { learningService, type LearningSuggestion } from '@/services/learning.service';

/**
 * Every KB merge proposal still waiting for this moderator — where the bell's "Review" lands.
 * The server already filters the list to the departments this viewer may see.
 *
 * Each proposal is listed by its one-line summary; its members (every entry's full text, files,
 * threads) are read only when it is opened. Mounting a review per row would fire one `/members`
 * request per proposal on every visit (FE audit M5).
 */
export const KbMergesReviewPage = () => {
  const [rows, setRows] = useState<LearningSuggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setError(null);
    try {
      const all = await learningService.listSuggestions('kb_quality');
      setRows(all.filter((row) => row.status === 'pending' && isKbConsolidationSuggestion(row)));
    } catch (err) {
      setError(getApiErrorMessage(err) ?? 'Could not load the proposals.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Layout>
      <div className="px-4 mx-auto space-y-4 w-full">
        <PageHeader
          title="Proposed knowledge base merges"
          description="Similar learned answers the AI suggests combining into one case. Nothing changes until you accept."
        />
        {error && <Alert variant="danger">{error}</Alert>}
        {rows === null && !error ? (
          <div className="flex justify-center py-8" role="status" aria-busy="true">
            <Spinner />
          </div>
        ) : rows?.length === 0 ? (
          <p className="py-8 text-sm text-center text-muted-foreground">
            No merges waiting for review.
          </p>
        ) : (
          <ul className="space-y-3" aria-label="Proposed merges">
            {(rows ?? []).map((row) => (
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
