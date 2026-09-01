import { useQuery } from '@tanstack/react-query';
import { routingDecisionService } from '@/services/routingDecision.service';

/**
 * One line under the "Needs routing" mark saying what the router actually saw.
 *
 * The mark alone tells an agent a decision was declined, not which decline it was — and the
 * two want opposite responses. A department that scored 0.79 against a 0.82 bar means the
 * rules are close and this thread needs routing; nothing scoring at all means the next
 * hundred like it will park too unless someone writes a rule.
 *
 * Renders nothing while loading, on error, or when no decision is stored. A parked thread
 * with no explanation is the status quo; a wrong explanation would be worse than none.
 */
export const WhyParked = ({ conversationId }: { conversationId: number | string }) => {
  const { data } = useQuery({
    queryKey: ['routing-decision', conversationId],
    queryFn: () => routingDecisionService.get(conversationId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (!data || data.verdict === 'routed') return null;

  if (data.verdict === 'nothing_scored') {
    return (
      <p data-testid="why-parked" className="mt-1 text-xs text-muted-foreground">
        No routing rule came close to this message — routing it by hand will not help the next one.
        Consider creating a rule from it.
      </p>
    );
  }

  const closest = data.closest;
  return (
    <p data-testid="why-parked" className="mt-1 text-xs text-muted-foreground">
      Closest match was <span className="font-medium text-foreground">{closest?.name}</span> at{' '}
      {closest ? closest.similarity.toFixed(2) : '—'}, just under the {data.weakBar} bar — so
      nothing was chosen.
    </p>
  );
};
