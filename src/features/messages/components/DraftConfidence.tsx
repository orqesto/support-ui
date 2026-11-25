import { AlertTriangle, TrendingUp } from 'lucide-react';

type DraftConfidenceProps = {
  /** Similarity of the sources found (0–1): how close they are, not whether they answer. */
  confidence: number;
  /** 'none': the draft was written from documentation of which no section answers the question. */
  knowledgeAnswer?: 'none';
};

/**
 * The corner of the AI draft card. The percentage is the similarity of the sources found, so a
 * draft that only says "we will check" used to read "95% Very Confident". When the backend says
 * no documentation section answers the question, say that instead of a percentage.
 */
export const DraftConfidence = ({ confidence, knowledgeAnswer }: DraftConfidenceProps) => {
  if (knowledgeAnswer === 'none') {
    return (
      <div className="flex flex-col gap-1 items-end max-w-[15rem] text-right" data-testid="draft-no-answer">
        <div className="flex gap-1 items-center text-sm font-semibold text-warning">
          <AlertTriangle className="w-4 h-4" />
          No answer found
        </div>
        <span className="text-xs text-muted-foreground">
          The documentation found does not answer this question. Check the draft before using it.
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1 items-end">
      <div className="flex gap-1 items-center text-sm font-semibold text-primary">
        <TrendingUp className="w-4 h-4" />
        {Math.round(confidence * 100)}%
      </div>
      <span className="text-xs text-muted-foreground">
        {confidence >= 0.9 ? 'Very Confident' : confidence >= 0.8 ? 'Confident' : 'Moderate'}
      </span>
    </div>
  );
};
