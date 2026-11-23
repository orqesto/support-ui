import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { TOPIC_REMOVE_HIT_AREA, restrictedTopicProblem } from './restrictedTopics';

export const RESTRICTED_TOPICS_TITLE = 'Restricted topics';
export const RESTRICTED_TOPICS_HELP =
  'Subjects the AI never answers on its own. A customer message about one of them is always handed to a person, even when a reply could be written. Topics are understood by their meaning, in any language; they are not matched as exact words.';
export const RESTRICTED_TOPICS_ALSO =
  'When AI is set up for this workspace (it reads the question), keyword rules and Telegram template replies are not sent on these subjects either.';
export const DEFAULTS_NOTE =
  'A new workspace starts with a few common topics. Every topic here can be removed; with none, the AI may answer any subject.';
export const NO_TOPICS_TEXT = 'No restricted topics';

export const DOSE_RULE_TITLE = 'Hold replies that state a dose';
export const DOSE_RULE_HELP =
  'An automatic reply that gives an amount in a dose unit (mg, ml, g, IU, units…) is handed to a person instead of being sent. It also holds pack sizes and weights such as "500 mg capsules" or "a 500 g bag", so switch it on only if you sell supplements, medicines or similar products. Applies to AI email replies, the email the AI sends to ask the customer for missing information, keyword-rule knowledge answers, the Telegram bot and the chat widget. A keyword rule\'s own fixed text is not checked for doses.';
/** Why the dose switch is out of use for a moderator: the backend lets only a workspace admin change it. */
export const DOSE_RULE_ADMIN_ONLY = 'Only a workspace admin can change this switch.';

/** A list of topics as read-only chips (someone who cannot change the settings). */
export const TopicsReadOnly = ({
  label,
  topics,
  emptyText,
}: {
  label: string;
  topics: readonly string[];
  /** Said in place of an empty list, when given. */
  emptyText?: string;
}) => (
  <ul aria-label={label} className="flex flex-wrap gap-1">
    {topics.length === 0 && emptyText && (
      <li className="text-xs italic text-muted-foreground">{emptyText}</li>
    )}
    {topics.map((topic) => (
      <li key={topic}>
        <Badge variant="warning" size="sm" className="font-normal cursor-default">
          {topic}
        </Badge>
      </li>
    ))}
  </ul>
);

type Props = {
  /** Names the list for screen readers and tests: "Workspace restricted topics". */
  label: string;
  /** This list's own topics: the only ones that can be removed here. */
  topics: readonly string[];
  /** Topics that apply anyway and cannot be changed here (a team: the workspace's). */
  alsoApplies?: readonly string[];
  emptyText: string;
  placeholder: string;
  disabled: boolean;
  /** Saves ONE added topic; resolves false when it was not saved (the typed topic is then kept). */
  onAdd: (topic: string) => Promise<boolean>;
  onRemove: (topic: string) => Promise<boolean>;
};

/** One editable list of restricted topics: its chips, each with a remove control, and "Add". */
export const RestrictedTopicsField = ({
  label,
  topics,
  alsoApplies = [],
  emptyText,
  placeholder,
  disabled,
  onAdd,
  onRemove,
}: Props) => {
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const add = async () => {
    const found = restrictedTopicProblem(draft, topics, alsoApplies);
    setProblem(found);
    if (found) return;
    const saved = await onAdd(draft.trim());
    if (saved) setDraft('');
  };

  return (
    <div className="space-y-2">
      <ul aria-label={label} className="flex flex-wrap gap-1">
        {topics.length === 0 && (
          <li className="text-xs italic text-muted-foreground">{emptyText}</li>
        )}
        {topics.map((topic) => (
          <li key={topic}>
            <Badge variant="warning" size="sm" className="gap-1 font-normal cursor-default">
              {topic}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled}
                onClick={() => void onRemove(topic)}
                aria-label={`Remove topic ${topic}`}
                className={`p-0 w-auto h-auto hover:text-destructive data-[inactive]:opacity-50 ${TOPIC_REMOVE_HIT_AREA}`}
              >
                <X className="w-3 h-3" />
              </Button>
            </Badge>
          </li>
        ))}
      </ul>
      <div className="flex gap-2 items-start">
        <Input
          size="sm"
          type="text"
          aria-label={`Add to ${label}`}
          value={draft}
          placeholder={placeholder}
          disabled={disabled}
          error={problem ?? undefined}
          onChange={(ev) => {
            setDraft(ev.target.value);
            setProblem(null);
          }}
          onKeyDown={(ev) => {
            if (ev.key !== 'Enter') return;
            ev.preventDefault();
            void add();
          }}
        />
        <Button
          type="button"
          size="sm"
          disabled={disabled || !draft.trim()}
          onClick={() => void add()}
          className="gap-1 items-center px-2 h-8 text-xs shrink-0"
        >
          <Plus className="w-3 h-3" />
          Add
        </Button>
      </div>
    </div>
  );
};
