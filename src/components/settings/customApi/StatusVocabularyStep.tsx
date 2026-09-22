import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';

/**
 * L2 P2: the vendor's status values, in the admin's own words.
 *
 * ⛔ The admin writes the words — owner's decision, 2026-09-22. There is no shared Odly
 * vocabulary, so this screen never proposes wording; it only ever asks. The consequence, recorded
 * in the scope: two vendors in one workspace can phrase the same state differently and nothing
 * corrects that. What it prevents is the failure that matters — a raw `3` or `AWAITING_FULFILMENT`
 * reaching an agent's draft as if it were a sentence.
 *
 * 🔑 The VALUES an admin needs to map cannot be known at configure time: the Send test redacts
 * every scalar (D3), so the response skeleton knows there is a `status` field and nothing about
 * what it holds. The backend therefore records what lookups actually returned, and this offers
 * those one click away — the same principle as picking fields from a real response rather than
 * typing paths blind.
 */
export const StatusVocabularyStep = ({
  labels,
  seen,
  onChange,
}: {
  labels: Record<string, string>;
  /** Values this lookup has returned that nobody has mapped. Read-only: an observation. */
  seen: string[];
  onChange: (next: Record<string, string>) => void;
}) => {
  const [newValue, setNewValue] = useState('');
  const [newWord, setNewWord] = useState('');

  const entries = Object.entries(labels);
  /* Already-mapped values must not be offered again: the suggestion list is what the vendor
     returned, and the backend stops recording a value once it is mapped — but a row mapped in THIS
     session has not reached the backend yet. */
  /* ⛔ `hasOwnProperty`, not `in`: these are values a VENDOR chooses, and `'toString' in labels`
     is true of every object — the one status an admin most needs to map would be the one silently
     filtered out of the list. The backend guards the same edge on the read side. */
  const unmapped = seen.filter(
    (value) => !Object.prototype.hasOwnProperty.call(labels, value)
  );

  const add = (value: string, word: string) => {
    const key = value.trim();
    const label = word.trim();
    if (key === '' || label === '') return;
    onChange({ ...labels, [key]: label });
    setNewValue('');
    setNewWord('');
  };

  const remove = (value: string) => {
    // ⛔ Rebuilt without the key rather than set to '' — the map is sent WHOLE, and an empty
    // string would be stored as a word that renders as nothing.
    const next = Object.fromEntries(entries.filter(([key]) => key !== value));
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <Label>What do your system’s statuses mean?</Label>
      <p className="text-xs text-muted-foreground">
        Your system’s own value on the left, the words an agent should read on the right. Anything
        you don’t map is shown exactly as your system sends it — we never invent a word for it.
      </p>

      {entries.length > 0 && (
        <div className="space-y-1">
          {entries.map(([value, word]) => (
            <div key={value} className="flex gap-2 items-center">
              <code className="flex-1 px-2 py-1 text-xs rounded bg-muted text-foreground truncate">
                {value}
              </code>
              <Input
                size="sm"
                value={word}
                onChange={(event) => onChange({ ...labels, [value]: event.target.value })}
                aria-label={`What agents read for ${value}`}
                maxLength={80}
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => remove(value)}
                aria-label={`Remove the wording for ${value}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {unmapped.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {/* ⛔ Says WHERE these came from. They are not a guess and not a list we shipped —
                they are what this lookup actually returned, which is the only reason they are
                worth trusting. */}
            Seen from this lookup and not mapped yet:
          </p>
          <div className="flex flex-wrap gap-1">
            {unmapped.map((value) => (
              <Button
                key={value}
                variant="ghost"
                size="sm"
                className="text-xs border border-border"
                onClick={() => setNewValue(value)}
              >
                {value}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 items-center">
        <Input
          size="sm"
          value={newValue}
          onChange={(event) => setNewValue(event.target.value)}
          placeholder="in_transit"
          aria-label="Your system’s status value"
          maxLength={64}
          className="flex-1"
        />
        <Input
          size="sm"
          value={newWord}
          onChange={(event) => setNewWord(event.target.value)}
          placeholder="On its way"
          aria-label="What agents read"
          maxLength={80}
          className="flex-1"
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => add(newValue, newWord)}
          disabled={newValue.trim() === '' || newWord.trim() === ''}
        >
          Add
        </Button>
      </div>
    </div>
  );
};
