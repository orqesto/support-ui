import { useState } from 'react';
import { CornerUpLeft } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import {
  buildRecordNote,
  defaultSelection,
  offerableFields,
} from './customApiRecordNote';
import { renderValue } from './customApiRowFields';
import type { CustomApiCategory } from '@/components/settings/customApi/categories';
import type { AddOutcome } from './useAiRecordNote';
import type { LookupField } from '@/services/customApiLookup.service';

/**
 * L2 P4 — the one control that puts a record into the reply.
 *
 * ⛔ IT ADDS TO THE REPLY NOTE, it does not write the reply. The note is the box an agent
 * already types their own facts into ("we've fixed it on our side"), and the backend hands that
 * to the model as fact. So this saves the retyping and changes nothing about who decides what
 * the customer is told: the agent still presses Write reply, still reads the draft, still edits
 * it, and can still delete the line.
 *
 * ⛔ PER FIELD, NEVER ALL-OR-NOTHING. A record holds things an agent may not want to send. The
 * boxes open on the category's own idea of what an answer needs — reference, status, date — and
 * everything else is the agent's to tick.
 */
export const CustomApiRecordInsert = ({
  row,
  fields,
  category,
  lookupLabel,
  ownership,
  onUseInReply,
}: {
  row: Record<string, unknown>;
  fields: LookupField[];
  category: CustomApiCategory | null;
  lookupLabel: string;
  /**
   * D38: the panel SHOWS a record it could not confirm belongs to this customer rather than
   * stranding the agent — so the warning has to travel to the one control that can put that
   * record's facts into a reply. Seeing it at the top of the card is not the same as seeing it
   * with your hand on the button.
   */
  ownership?: 'owned' | 'mismatch' | 'unverified';
  /**
   * Adds the note. Says what happened, because "already there" and "no room" ask the agent for
   * two different things — and a shared "no" would tell them to shorten a note that is fine.
   */
  onUseInReply: (note: string) => AddOutcome;
}) => {
  const offered = offerableFields(row, fields);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(() => defaultSelection(row, fields));
  const [outcome, setOutcome] = useState<AddOutcome | null>(null);

  // Nothing this record can contribute ⇒ no control. An agent pressing a button that can only
  // ever produce an empty note learns to distrust the button.
  if (offered.length === 0) return null;

  const note = buildRecordNote({ row, fields, category, selectedPaths: selected, lookupLabel });

  const toggle = (path: string) =>
    setSelected((current) =>
      current.includes(path) ? current.filter((one) => one !== path) : [...current, path]
    );

  return (
    <div className="pt-1">
      {!open ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1 text-[10px] text-muted-foreground"
          onClick={() => {
            setOpen(true);
            setOutcome(null);
          }}
        >
          <CornerUpLeft className="mr-1 w-3 h-3" />
          Use in reply
        </Button>
      ) : (
        <div className="space-y-1 rounded border border-border/60 p-1.5">
          <p className="text-[10px] text-muted-foreground">
            {/* Says where it goes. An agent who thinks this SENDS something will not press it. */}
            Adds these to your note for the AI draft — you still write and edit the reply.
          </p>
          {ownership === 'mismatch' && (
            /* ⛔ NOT A REFUSAL (D38: the owner chose to show these rather than strand an agent
               whose customer wrote from a second address) — but the model is told to treat this
               note as fact, so the one moment an agent must be reminded is this one. */
            <p className="text-[10px] text-warning">
              This record is not confirmed as this customer’s.
            </p>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {offered.map((field) => (
              <Checkbox
                key={field.path}
                size="sm"
                checked={selected.includes(field.path)}
                onChange={() => toggle(field.path)}
                /* The VALUE is in the label, not only the field name: an agent ticking "Total"
                   is vouching for 348.50, and should not have to look away to see which. */
                label={`${field.label}: ${renderValue(row, field)}`}
                className="text-[10px]"
              />
            ))}
          </div>

          {/* ⛔ THE EXACT TEXT, before it is added. The model is told to treat this as fact, so
              an agent must be able to read the sentence they are vouching for. */}
          {note && <p className="text-[10px] text-foreground break-words">{note}</p>}

          <div className="flex gap-2 items-center">
            <Button
              size="sm"
              variant="ghost"
              disabled={note === null}
              onClick={() => {
                if (!note) return;
                setOutcome(onUseInReply(note));
              }}
            >
              Add to my note
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {outcome === 'added' && (
              <Badge variant="success">Added to your note</Badge>
            )}
            {outcome === 'duplicate' && (
              /* Not a failure, and not the same as a full note: saying it twice would only make
                 the model repeat itself. */
              <Badge variant="secondary">Already in your note</Badge>
            )}
            {outcome === 'too_long' && (
              /* ⛔ NEVER SILENTLY CUT. The backend slices the note at 2000 characters, which
                 would take a total or a date in half. */
              <Badge variant="warning">Note is full — shorten it and try again</Badge>
            )}
            {outcome === 'fact_too_long' && (
              /* A DIFFERENT SENTENCE, because "shorten your note" is false here: the note may be
                 empty and it is this record that does not fit. Untick a field instead. */
              <Badge variant="warning">Too long for the note — untick a field</Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
