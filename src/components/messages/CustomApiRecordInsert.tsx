import { useState } from 'react';
import { CornerUpLeft } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { buildRecordNote, defaultSelection, offerableFields } from './customApiRecordNote';
import { renderValue } from './customApiRowFields';
import type { CustomApiCategory } from '@/components/settings/customApi/categories';
import type { AddOutcome } from './recordInsertOutcome';
import type { LookupField } from '@/services/customApiLookup.service';

/** v4 `.k-ob`: the outcome chip beside the buttons. */
const OUTCOME = 'rounded-[5px] px-[7px] py-0.5 font-sans text-[10.5px] font-medium cursor-default';

/**
 * L2 P4 — the one control that puts a record into the reply.
 *
 * ⛔ IT ADDS A SENTENCE TO THE REPLY, it sends nothing: the agent reads and edits the reply
 * before pressing Send. Pressing AI draft afterwards reads the reply's text as the agent's note,
 * and the backend hands that to the model as fact — so the record's facts reach the draft too.
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
    <div className="pt-0.5">
      {!open ? (
        // v4 `.k-use`: a quiet link-button under the record, "↩ Use in reply".
        <Button
          variant="ghost"
          size="sm"
          className="h-auto px-[5px] py-0.5 rounded-[5px] font-sans text-[11px] font-normal text-faint-foreground hover:bg-sunken hover:text-foreground"
          onClick={() => {
            setOpen(true);
            setOutcome(null);
          }}
        >
          <CornerUpLeft className="mr-1 w-3 h-3" />
          Use in reply
        </Button>
      ) : (
        // v4 `.k-ins`: the per-field ticks, the exact sentence, then add / cancel and the outcome.
        <div className="grid gap-1.5 rounded-[7px] border border-border bg-raised px-2 py-[7px]">
          <p className="text-[10.5px] leading-[1.45] text-faint-foreground">
            {/* Says where it goes. An agent who thinks this SENDS something will not press it. */}
            Adds these to your reply as a sentence — edit it before sending.
          </p>
          {ownership === 'mismatch' && (
            /* ⛔ NOT A REFUSAL (D38: the owner chose to show these rather than strand an agent
               whose customer wrote from a second address) — but the reply states it to the
               customer as fact, so the one moment an agent must be reminded is this one. */
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
          {note && (
            <p className="rounded-[5px] border border-hair bg-card px-[7px] py-[5px] text-[11.5px] leading-[1.45] text-foreground break-words">
              {note}
            </p>
          )}

          <div className="flex flex-wrap gap-1.5 items-center">
            <Button
              size="sm"
              variant="ghost"
              disabled={note === null}
              onClick={() => {
                if (!note) return;
                setOutcome(onUseInReply(note));
              }}
            >
              Add to my reply
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {outcome === 'added' && (
              <Badge variant="success" className={OUTCOME}>
                Added to your reply
              </Badge>
            )}
            {outcome === 'duplicate' && (
              /* Not a failure: saying it twice to the customer helps nobody. */
              <Badge variant="secondary" className={OUTCOME}>
                Already in your reply
              </Badge>
            )}
            {outcome === 'note_in_progress' && (
              /* The composer holds an internal note being written: switching it to Reply would
                 carry that note's text into a message to the customer. */
              <Badge variant="warning" className={OUTCOME}>
                Post or clear your internal note first
              </Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
