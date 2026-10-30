import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Card, CardContent } from '@/components/ui/Card';
import { AUTO_ACTIONS_HREF } from '@/components/kb/autoActions/kbAutoActionCopy';
import type { KbEngineSummary } from '@/services/kbEngine.types';

/** The digest line (§8): what the engine did this week. */
export const kbEngineDigest = (summary: KbEngineSummary): string =>
  `Engine did ${summary.week.actions} things this week, ${summary.week.undone} undone, ${summary.questions.open} questions for you`;

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
 * F4 fills this with the question card and queue. Until then: the count, so the view is honest.
 */
export const KbQuestionsSlot = ({ open, search }: { open: number; search: string }) => (
  <Card data-testid="kb-questions-slot" data-search={search}>
    <CardContent className="p-4 sm:p-6">
      <p className="text-sm text-muted-foreground">
        {open === 1 ? '1 question waits for you.' : `${open} questions wait for you.`}
      </p>
    </CardContent>
  </Card>
);

/**
 * F5 fills this with the Engine activity panel (findings strip, changes, Rate the engine). Under
 * the card it starts collapsed; the Engine activity view shows it expanded.
 */
export const KbEngineActivitySlot = ({
  summary,
  expanded,
}: {
  summary: KbEngineSummary | null;
  expanded: boolean;
}) => (
  <Card data-testid="kb-engine-activity-slot" data-expanded={expanded}>
    <CardContent className="p-4 space-y-1">
      <p className="font-semibold text-foreground">Engine activity</p>
      <p className="text-sm text-muted-foreground">
        {summary ? kbEngineDigest(summary) : 'Engine activity is not available right now.'}
      </p>
    </CardContent>
  </Card>
);

/** The Questions view: the count, the queue (or "Nothing needs you"), Engine activity collapsed. */
export const KbQuestionsView = ({
  openQuestions,
  search,
  summary,
}: {
  openQuestions: number | null;
  search: string;
  summary: KbEngineSummary | null;
}) => (
  <>
    <h2 className="text-lg font-semibold font-display text-foreground">
      Questions for you{openQuestions !== null ? ` (${openQuestions})` : ''}
    </h2>
    {openQuestions === 0 ? (
      <KbNothingNeedsYou />
    ) : (
      <KbQuestionsSlot open={openQuestions ?? 0} search={search} />
    )}
    <KbEngineActivitySlot summary={summary} expanded={false} />
  </>
);
