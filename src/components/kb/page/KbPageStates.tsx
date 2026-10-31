import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Card, CardContent } from '@/components/ui/Card';
import { AUTO_ACTIONS_HREF } from '@/components/kb/autoActions/kbAutoActionCopy';
import type { ReactNode } from 'react';
import type { KbQuestion } from '@/services/kbEngine.types';
import { KbQuestionQueue } from '@/components/kb/questions/KbQuestionQueue';

/** Questions view with no open question. */
export const KbNothingNeedsYou = () => (
  <Card>
    <CardContent className="p-8 space-y-2 text-center sm:p-12">
      <h2 className="text-xl font-bold font-display text-foreground">Nothing needs you</h2>
      <p className="text-sm text-muted-foreground">
        The engine has no open questions. It will ask here when two answers disagree.
      </p>
    </CardContent>
  </Card>
);

/** Live answers on a knowledge base with no entries at all (no filter set). */
export const KbStillLearning = () => (
  <Card>
    <CardContent className="p-8 space-y-2 text-center sm:p-12">
      <h2 className="text-xl font-bold font-display text-foreground">
        The engine is still learning
      </h2>
      <p className="text-sm text-muted-foreground">
        There are no entries yet. They appear here as the engine learns from answered threads and
        documents.
      </p>
    </CardContent>
  </Card>
);

/**
 * One line, in agent words, when the engine acts on nothing: every kill switch is on (an
 * unreadable one counts as on, server-side), or nightly scoring cannot run (`nightlyOff`). Which
 * switch or flag is for admins: it is on the Automatic actions page the link opens.
 */
export const KbEngineOffNotice = ({
  killed,
  nightlyOff,
}: {
  killed: boolean;
  nightlyOff: boolean;
}) => {
  if (!killed && !nightlyOff) return null;
  return (
    <Alert variant="warning" className="py-2 text-sm">
      <span data-testid="kb-engine-off">
        {killed
          ? 'The engine is switched off, so it changes nothing by itself. '
          : "The engine's nightly check is off, so nothing is reviewed automatically. "}
        <Link to={AUTO_ACTIONS_HREF} className="font-medium underline">
          Automatic actions →
        </Link>
      </span>
    </Alert>
  );
};

/**
 * The Questions view: the count, the queue (or "Nothing needs you"), Engine activity collapsed.
 * The queue always asks /questions: it is the authority on what is open, the summary only counts.
 */
export const KbQuestionsView = ({
  openQuestions,
  search,
  departmentId,
  activity,
  onDecided,
  startAt,
  onLinkUsed,
}: {
  openQuestions: number | null;
  search: string;
  departmentId?: number;
  startAt?: number;
  onLinkUsed?: () => void;
  /** Engine activity, collapsed under the card. */
  activity: ReactNode;
  onDecided?: (question: KbQuestion) => void;
}) => (
  <>
    <h2 className="text-lg font-semibold font-display text-foreground">
      Questions for you{openQuestions !== null ? ` (${openQuestions})` : ''}
    </h2>
    <KbQuestionQueue
      departmentId={departmentId}
      search={search}
      empty={<KbNothingNeedsYou />}
      onDecided={onDecided}
      startAt={startAt}
      onLinkUsed={onLinkUsed}
    />
    {activity}
  </>
);

/** The one-line "Already decided" a decide link leaves when its item is gone. */
export const KbDecideNotice = ({ text }: { text: string | null }) =>
  text ? (
    <Alert variant="info" className="py-2 text-sm">
      <span role="status">{text}</span>
    </Alert>
  ) : null;
