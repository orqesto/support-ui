import { useState } from 'react';
import { deriveFormat, describeFormat, findInText, type RecordFormat } from './recordFormat';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Input } from '@/components/ui/Input';

/**
 * D36 — the pre-fill format, derived from an EXAMPLE — CA-5 Task 6.
 *
 * ⛔ NO REGEX FIELD EXISTS IN THIS COMPONENT, and a test asserts the rendered form has no such
 * input. D36 reversed D14 and set that bound on itself: an admin-authored pattern applied to
 * inbound message text is an unbounded ReDoS surface.
 *
 * ⛔ "prefix / length / charset" is our vocabulary. An admin who types `137416` should not have
 * to know it is six digits with no prefix — they type the thing they read off an order, and we
 * say back what we understood, then show it working on a sentence before they save.
 */

interface Props {
  value: RecordFormat | null;
  onChange: (next: RecordFormat | null) => void;
}

/** A sentence that looks like the ones customers actually write. */
const DEFAULT_SAMPLE = 'Hi, where is my order 137416? I ordered it last week.';

export const RecordFormatStep = ({ value, onChange }: Props) => {
  const [example, setExample] = useState(value ? `${value.prefix}${'0'.repeat(value.length)}` : '');
  const [sample, setSample] = useState(DEFAULT_SAMPLE);

  const derived = example.trim() ? deriveFormat(example) : null;
  const matches = derived ? findInText(sample, derived) : [];

  const update = (next: string) => {
    setExample(next);
    // ⛔ Cleared means "do not pre-fill anything", which is a real choice — not an error.
    onChange(next.trim() ? deriveFormat(next) : null);
  };

  return (
    <div className="space-y-2">
      <Input
        label="An example of one of your order numbers (optional)"
        value={example}
        onChange={(event) => update(event.target.value)}
        placeholder="137416"
      />
      <p className="text-xs text-muted-foreground">
        If a customer writes their number in a message, we can fill it in for the agent. Leave this
        blank and they will type it themselves.
      </p>

      {example.trim() && !derived && (
        <Alert variant="warning">
          <AlertDescription>
            We could not read that as a number format. It should end in letters or digits — for
            example <code>137416</code> or <code>ORD-137416</code>.
          </AlertDescription>
        </Alert>
      )}

      {derived && (
        <div className="space-y-2 rounded-md border border-border p-3">
          {/* ⛔ Say back what we understood, in their words, before anything is saved. */}
          <p className="text-xs text-foreground">
            We read that as: <strong>{describeFormat(derived)}</strong>.
          </p>

          <Input
            label="Try it on a message"
            value={sample}
            onChange={(event) => setSample(event.target.value)}
          />
          {matches.length > 0 ? (
            /*
             * ⛔ "we would suggest", not "we will find". This preview mirrors the backend's
             * matcher rather than calling it, so it must not assert what the server will do.
             */
            <p className="text-xs text-green-700 dark:text-green-300">
              In that message we would suggest: <strong>{matches.join(', ')}</strong>.
            </p>
          ) : (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              We would not find anything in that message. Try a sentence containing a number in this
              format — otherwise nothing will be pre-filled for your agents.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
