import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Kbd } from '@/components/ui/Kbd';
import { Textarea } from '@/components/ui/Textarea';
import { cn } from '@/lib/utils';
import type {
  KbQuestion,
  KbQuestionAnswer,
  KbQuestionChoice,
  KbQuestionEvidence,
} from '@/services/kbEngine.types';

/**
 * KB engine Stage 1 (F4): one question, as the owner approved it in the F0 mock. The question;
 * its answers side by side (stacked on a phone) with their evidence; what the engine already ruled
 * out; the choices the backend offers for this kind, equal weight; Skip / not sure; ONE primary
 * "Save answer", disabled until an answer is chosen. Stage 1 shows no "Depends on" and no
 * "used in N drafts" line (no usage record exists yet).
 */

export type KbQuestionCardProps = {
  question: KbQuestion;
  onAnswer: (choice: KbQuestionChoice['key'], text?: string) => Promise<void>;
  onSkip: () => void;
  busy: boolean;
  /** "Question {position} of {total}". */
  position?: number;
  total?: number;
  /** The last answer's error; the card and the typed text stay. */
  error?: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

const openFor = (openedAt: string): string => {
  const days = Math.floor((Date.now() - new Date(openedAt).getTime()) / DAY_MS);
  if (!Number.isFinite(days) || days < 1) return 'Opened today';
  return days === 1 ? 'Open for 1 day' : `Open for ${days} days`;
};

/** True while the keyboard belongs to a text field (shortcuts are ignored there). */
export const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
};

/**
 * Something sits over the card and owns the keys: a dialog, a menu, a list box or the entry
 * drawer. The card's single keys (1–4, j / k) must not act behind it.
 */
const OVERLAY_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-drawer="open"]';
export const overlayIsOpen = (): boolean =>
  typeof document !== 'undefined' && document.querySelector(OVERLAY_SELECTOR) !== null;

/** Should a single-key shortcut on the card ignore this key press? */
export const ignoresCardKey = (event: KeyboardEvent): boolean =>
  event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target) || overlayIsOpen();

const EvidenceLine = ({ label, value }: { label: string; value: string }) => (
  <div className="flex gap-2 justify-between text-sm">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="font-medium text-right text-foreground">{value}</dd>
  </div>
);

/** Each line shows only when it has something to say (countries are Stage 3: always empty now). */
const Evidence = ({ evidence }: { evidence: KbQuestionEvidence }) => {
  const seen = evidence.threads > 0 || evidence.customers > 0;
  const dates =
    evidence.firstAt && evidence.lastAt
      ? shortDate(evidence.firstAt) === shortDate(evidence.lastAt)
        ? shortDate(evidence.firstAt)
        : `${shortDate(evidence.firstAt)} to ${shortDate(evidence.lastAt)}`
      : evidence.firstAt
        ? shortDate(evidence.firstAt)
        : null;
  if (!seen && !dates && evidence.countries.length === 0) return null;
  return (
    <dl className="space-y-1" data-testid="kb-question-evidence">
      {seen && (
        <EvidenceLine
          label="Seen in"
          value={`${evidence.threads} ${evidence.threads === 1 ? 'thread' : 'threads'}, ${
            evidence.customers
          } ${evidence.customers === 1 ? 'customer' : 'customers'}`}
        />
      )}
      {evidence.countries.length > 0 && (
        <EvidenceLine label="Countries" value={evidence.countries.join(', ')} />
      )}
      {dates && <EvidenceLine label="Dates" value={dates} />}
    </dl>
  );
};

const AnswerPanel = ({ answer, lettered }: { answer: KbQuestionAnswer; lettered: boolean }) => (
  <div
    className="flex flex-col gap-3 p-4 min-w-0 rounded-lg border bg-background"
    data-testid="kb-question-answer"
  >
    <div className="flex gap-2 items-start">
      {lettered && (
        <Badge variant="secondary" className="shrink-0">
          {answer.label}
        </Badge>
      )}
      <div className="space-y-1 min-w-0">
        {answer.question && (
          <p className="text-sm break-words text-muted-foreground">{answer.question}</p>
        )}
        <p className="font-semibold whitespace-pre-line break-words text-foreground">
          {answer.answer || '(no answer text)'}
        </p>
      </div>
    </div>
    <Evidence evidence={answer.evidence} />
  </div>
);

export const KbQuestionCard = ({
  question,
  onAnswer,
  onSkip,
  busy,
  position,
  total,
  error,
}: KbQuestionCardProps) => {
  const [selected, setSelected] = useState<KbQuestionChoice['key'] | null>(null);
  const [text, setText] = useState('');
  const choices = useMemo(() => question.choices.slice(0, 4), [question.choices]);
  const chosen = choices.find((choice) => choice.key === selected) ?? null;
  const needsText = chosen?.needsText === true;
  const textBox = useRef<HTMLTextAreaElement>(null);
  const canSave = !busy && chosen !== null && (!needsText || text.trim().length > 0);

  // 1–4 pick the choice in that place; ignored while typing. A layout effect: the keys work from
  // the moment the card is on screen (a passive effect can attach after the first key press).
  useLayoutEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (ignoresCardKey(event)) return;
      const index = ['1', '2', '3', '4'].indexOf(event.key);
      if (index < 0 || index >= choices.length || busy) return;
      event.preventDefault();
      setSelected(choices[index].key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choices, busy]);

  // Picking a choice that needs text puts the cursor in the box: no extra click.
  useEffect(() => {
    if (needsText) textBox.current?.focus();
  }, [needsText, selected]);

  const save = () => {
    if (!canSave || !chosen) return;
    void onAnswer(chosen.key, needsText ? text.trim() : undefined);
  };

  const lettered = question.answers.length > 1;
  // The backend's prompt: the question, then (after a blank line) the engine's draft, if any.
  const split = question.prompt.indexOf('\n\n');
  const promptHead = split < 0 ? question.prompt : question.prompt.slice(0, split);
  const promptRest = split < 0 ? '' : question.prompt.slice(split + 2).trim();

  return (
    <Card data-testid="kb-question-card">
      <CardContent className="p-4 space-y-4 sm:p-6">
        <div className="flex flex-wrap gap-2 justify-between items-center text-xs text-muted-foreground">
          <span data-testid="kb-question-position">
            {position !== undefined && total !== undefined
              ? `Question ${position} of ${total}`
              : ''}
          </span>
          <span>
            {question.expired
              ? `Waiting since ${shortDate(question.openedAt)}`
              : openFor(question.openedAt)}
          </span>
        </div>
        <h2 className="text-lg font-bold whitespace-pre-line break-words font-display text-foreground sm:text-xl">
          {promptHead}
        </h2>
        {promptRest && (
          <p
            className="p-3 text-sm whitespace-pre-line break-words rounded-lg bg-muted text-foreground"
            data-testid="kb-question-draft"
          >
            {promptRest}
          </p>
        )}
        {question.answers.length > 0 && (
          <div
            className={cn(
              'grid grid-cols-1 gap-3',
              question.answers.length > 1 && 'md:grid-cols-2'
            )}
            data-testid="kb-question-answers"
          >
            {question.answers.map((answer) => (
              <AnswerPanel
                key={`${answer.label}-${answer.entryId ?? 'draft'}`}
                answer={answer}
                lettered={lettered}
              />
            ))}
          </div>
        )}
        {question.ruledOut.length > 0 && (
          <p className="flex gap-2 items-start text-sm text-muted-foreground">
            <Info className="mt-0.5 w-4 h-4 shrink-0" />
            <span>
              <span className="font-medium text-foreground">Engine already ruled out:</span>{' '}
              {question.ruledOut.join('; ')}
            </span>
          </p>
        )}
        <div className="pt-3 space-y-3 border-t">
          <div
            className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"
            role="group"
            aria-label="Your answer"
            data-testid="kb-question-choices"
          >
            {choices.map((choice, index) => {
              const on = choice.key === selected;
              return (
                <Button
                  key={choice.key}
                  variant="outline"
                  aria-pressed={on}
                  disabled={busy}
                  onClick={() => setSelected(choice.key)}
                  className={cn(
                    'justify-start py-2 w-full h-auto text-left whitespace-normal min-h-10 sm:w-auto sm:flex-1',
                    on && 'border-primary bg-primary-muted text-primary hover:bg-primary-muted'
                  )}
                >
                  <Kbd className="mr-2">{index + 1}</Kbd>
                  {choice.label}
                </Button>
              );
            })}
          </div>
          {needsText && (
            <div className="space-y-1">
              <Textarea
                ref={textBox}
                aria-label="The right answer"
                placeholder="Write the right answer"
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={3}
                disabled={busy}
              />
              <p className="text-xs text-muted-foreground">
                Your answer goes live at once when you save it.
              </p>
            </div>
          )}
          {error && (
            <Alert variant="danger" className="py-2 text-sm">
              <span data-testid="kb-question-error">{error}</span>
            </Alert>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between sm:items-center">
            <Button variant="ghost" onClick={onSkip} disabled={busy} className="w-full sm:w-auto">
              Skip / not sure
            </Button>
            <Button
              onClick={save}
              disabled={!canSave}
              isLoading={busy}
              className="w-full sm:w-auto"
            >
              Save answer
            </Button>
          </div>
        </div>
        <p className="hidden text-xs text-muted-foreground md:block">
          <Kbd>j</Kbd> next <Kbd>k</Kbd> previous{' '}
          {choices.map((choice, index) => (
            <Kbd key={choice.key} className="mr-1">
              {index + 1}
            </Kbd>
          ))}
          choose an answer
        </p>
      </CardContent>
    </Card>
  );
};
