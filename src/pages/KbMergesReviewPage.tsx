import { useCallback, useEffect, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { PageHeader } from '@/components/shared/PageHeader';
import { KbConsolidationReview } from '@/components/kb/KbConsolidationReview';
import { Alert } from '@/components/ui/Alert';
import { Card, CardContent } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { isKbConsolidationSuggestion } from '@/lib/learningSuggestionPermissions';
import { learningService, type LearningSuggestion } from '@/services/learning.service';

/**
 * Every KB merge proposal still waiting for this moderator — where the bell's "Review" lands.
 * The server already filters the list to the departments this viewer may see.
 */
export const KbMergesReviewPage = () => {
  const [rows, setRows] = useState<LearningSuggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          (rows ?? []).map((row) => (
            <Card key={row.id}>
              <CardContent className="pt-4">
                <KbConsolidationReview suggestionId={row.id} />
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </Layout>
  );
};
