import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { routingDecisionService } from '@/services/routingDecision.service';
import { Tooltip } from '@/components/ui/Tooltip';

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
export const WhyParked = ({
  conversationId,
  asIcon = false,
}: {
  conversationId: number | string;
  /**
   * An ⓘ beside the mark with the sentence on hover/focus (the thread header, 2026-10-29: as a
   * line it took two rows of the conversation's room). The line form stays for the sidebar.
   */
  asIcon?: boolean;
}) => {
  const { data } = useQuery({
    queryKey: ['routing-decision', conversationId],
    queryFn: () => routingDecisionService.get(conversationId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (!data || data.verdict === 'routed') return null;

  const closest = data.closest;
  const sentence =
    data.verdict === 'nothing_scored' ? (
      <>
        No routing rule came close to this thread — routing it by hand will not help the next one.
        Consider creating a rule from it.
      </>
    ) : (
      <>
        Closest match was <span className="font-medium text-foreground">{closest?.name}</span> at{' '}
        {closest ? closest.similarity.toFixed(2) : '—'}, just under the {data.weakBar} bar — so
        nothing was chosen.
      </>
    );

  if (asIcon) {
    return (
      <Tooltip content={<span data-testid="why-parked">{sentence}</span>} size="sm">
        <span
          tabIndex={0}
          aria-label="Why it needs routing"
          className="inline-flex flex-shrink-0 items-center text-muted-foreground hover:text-foreground"
        >
          <Info className="w-3.5 h-3.5" />
        </span>
      </Tooltip>
    );
  }

  return (
    <p data-testid="why-parked" className="min-w-0 text-xs text-muted-foreground">
      {sentence}
    </p>
  );
};
