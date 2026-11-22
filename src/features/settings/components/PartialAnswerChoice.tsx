import { Button } from '@/components/ui/Button';
import type { AutoReplyPartialAnswer } from '@/services/organization.service';

/**
 * What the email auto-reply does when the AI can answer only some of a customer's questions
 * (per-question retrieval, 2026-11-16). The workspace row picks one of two; a team row also offers
 * "Same as workspace" (`value` undefined).
 */
export const PARTIAL_ANSWER_LABEL: Record<AutoReplyPartialAnswer, string> = {
  hand_to_agent: 'Hand to an agent',
  send_and_follow_up: 'Send and follow up',
};
const CHOICES: AutoReplyPartialAnswer[] = ['hand_to_agent', 'send_and_follow_up'];
export const PARTIAL_ANSWER_TITLE = 'When the AI can answer only some questions';
const HELP =
  'Hand to an agent: nothing is sent; the draft and a note naming the unanswered questions wait for an agent. Send and follow up: if the reply passes the checks every automatic reply passes, the answers are sent with a line that a colleague will follow up, and the thread is flagged for that; otherwise it is held for a person.';

type Props = {
  /** The group's accessible name (unique per row). */
  groupLabel: string;
  value: AutoReplyPartialAnswer | undefined;
  onChange: (value: AutoReplyPartialAnswer | undefined) => void;
  disabled?: boolean;
  /** Team rows: the workspace value, shown on the "Same as workspace" choice. */
  inherited?: AutoReplyPartialAnswer;
  /** Pill buttons for the compact team rows. */
  pillClass?: (selected: boolean) => string;
};

export const PartialAnswerChoice = ({
  groupLabel,
  value,
  onChange,
  disabled,
  inherited,
  pillClass,
}: Props) => {
  const choose = (next: AutoReplyPartialAnswer | undefined) => {
    if (next !== value) onChange(next);
  };
  const button = (key: string, label: string, selected: boolean, next?: AutoReplyPartialAnswer) => (
    <Button
      key={key}
      type="button"
      size="sm"
      variant={pillClass ? 'outline' : selected ? 'primary' : 'outline'}
      aria-pressed={selected}
      disabled={disabled}
      onClick={() => choose(next)}
      className={pillClass?.(selected)}
    >
      {label}
    </Button>
  );
  return (
    <div className="space-y-1">
      <div role="group" aria-label={groupLabel} className="flex flex-wrap gap-2 items-center">
        {pillClass && (
          <span className="text-xs text-muted-foreground">{PARTIAL_ANSWER_TITLE}:</span>
        )}
        {inherited !== undefined &&
          button(
            'inherit',
            `Same as workspace (${PARTIAL_ANSWER_LABEL[inherited]})`,
            value === undefined
          )}
        {CHOICES.map((choice) =>
          button(choice, PARTIAL_ANSWER_LABEL[choice], value === choice, choice)
        )}
      </div>
      <p
        className={
          pillClass ? 'text-[10px] text-muted-foreground' : 'text-xs text-muted-foreground'
        }
      >
        {HELP}
      </p>
    </div>
  );
};
