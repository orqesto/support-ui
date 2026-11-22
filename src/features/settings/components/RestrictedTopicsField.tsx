import { useState } from 'react';
import { Lock, Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { TOPIC_REMOVE_HIT_AREA, restrictedTopicProblem } from './restrictedTopics';
import type { BuiltInRestrictedTopic } from '@/types/api';

export const RESTRICTED_TOPICS_TITLE = 'Restricted topics';
export const RESTRICTED_TOPICS_HELP =
  'Subjects the AI never answers on its own. A customer message about one of them is always handed to a person, even when a reply could be written. Topics are understood by their meaning, in any language; they are not matched as exact words.';
export const RESTRICTED_TOPICS_ALSO =
  'Keyword rules and Telegram template replies are not sent on these subjects either.';
export const BUILT_IN_NOTE = 'Always on. The built-in topics cannot be removed.';

/**
 * The built-in topics as the backend names them: plain chips with a lock, never a remove control.
 * Nothing when the backend sent none — the note beside it still says they are always on.
 */
export const BuiltInTopics = ({ topics }: { topics: readonly BuiltInRestrictedTopic[] }) =>
  topics.length === 0 ? null : (
    <ul aria-label="Built-in restricted topics" className="flex flex-wrap gap-1">
      {topics.map((topic) => (
        <li key={topic.key}>
          <Badge variant="outline" size="sm" className="gap-1 font-normal">
            <Lock className="w-3 h-3" aria-hidden />
            {topic.label}
          </Badge>
        </li>
      ))}
    </ul>
  );

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
  /** The built-in topics' names: one of them is not added again. */
  builtIn?: readonly string[];
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
  builtIn = [],
  onAdd,
  onRemove,
}: Props) => {
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const add = async () => {
    const found = restrictedTopicProblem(draft, topics, alsoApplies, builtIn);
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
