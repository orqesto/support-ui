import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { routingReplayService } from '@/services/routingReplay.service';
import { getApiErrorMessage } from '@/lib/errorMessages';

const RANGES = [30, 60, 90] as const;
const BAR_KNOB = 'embeddingWeakThreshold';

const pct = (rate: number): string => `${(100 * rate).toFixed(1)}%`;

/**
 * What a different similarity bar would have done to THIS workspace's mail.
 *
 * The backend has re-run the real decision cascade over stored decisions since #558; nothing
 * ever asked it. The bar itself only became sweepable in #605 — before that the sweep moved
 * three knobs, none of which was the threshold that parks the queue.
 *
 * ⛔ The coverage line is not decoration. A conversation can only answer the question if the
 * router recorded a near-miss band for it; on production most parked mail has none, because
 * nothing scored within reach at all. A sweep that moves nothing across a corpus of zero is
 * not evidence that the bar is right.
 */
export const RoutingBarScorecard = () => {
  const [days, setDays] = useState<number>(30);
  const { data, isLoading, error } = useQuery({
    queryKey: ['routing-replay', days],
    queryFn: () => routingReplayService.get(days),
    retry: false,
  });

  const sweep = data?.sweeps.find((entry) => entry.knob === BAR_KNOB);
  const coverage = data?.weakThresholdCoverage;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-2 justify-between items-center">
          <div>
            <h3 className="text-sm font-medium">What a different routing bar would have done</h3>
            <p className="text-xs text-muted-foreground">
              Your own stored decisions, re-run through the live cascade with the similarity bar
              moved. Nothing is applied — this only says what would have happened.
            </p>
          </div>
          <div className="flex gap-1">
            {RANGES.map((range) => (
              <Button
                key={range}
                size="sm"
                variant={range === days ? 'primary' : 'outline'}
                onClick={() => setDays(range)}
              >
                {range}d
              </Button>
            ))}
          </div>
        </div>

        {error && (
          <Alert variant="danger">
            {getApiErrorMessage(error) ?? 'Could not run the routing replay.'}
          </Alert>
        )}
        {isLoading && <p className="text-xs text-muted-foreground">Replaying…</p>}

        {data && !sweep && (
          <p className="text-xs text-muted-foreground">
            This backend does not sweep the similarity bar yet.
          </p>
        )}

        {data && sweep && (
          <>
            <p className="text-xs text-muted-foreground">
              {data.corpus.replayable} of {data.corpus.conversations} conversations replayable
              {coverage
                ? ` · ${coverage.withNearMissBand} carry a near-miss band, so only those can move`
                : ''}
              .
            </p>

            {coverage?.withNearMissBand === 0 ? (
              <Alert variant="info">
                No conversation in this window recorded a near-miss, so the bar could not have
                changed any of them. Mail is parking for another reason — most often that no rule
                came close at all.
              </Alert>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-2 py-1 font-medium">Bar</th>
                    <th className="px-2 py-1 font-medium text-right">Sent to triage</th>
                    <th className="px-2 py-1 font-medium text-right">Misrouted</th>
                    <th className="px-2 py-1 font-medium text-right">Routed without a verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {sweep.points.map((point) => (
                    <tr
                      key={point.value}
                      className={`border-t border-border ${point.isBaseline ? 'font-medium' : ''}`}
                    >
                      <td className="px-2 py-1">
                        {point.value}
                        {point.isBaseline && (
                          <span className="ml-2 text-xs text-muted-foreground">in use</span>
                        )}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">
                        {pct(point.tally.triageRate)}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">
                        {pct(point.tally.misrouteRate)}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                        {point.tally.unlabeledConfident}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="text-xs text-muted-foreground">
              “Routed without a verdict” is the honest column: those threads stop being parked, and
              nothing here proves they were sent to the right place.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
};
