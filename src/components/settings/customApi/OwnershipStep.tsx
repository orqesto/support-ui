import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import type { CustomApiEndpoint, FieldPick } from '@/services/customApi.service';

/**
 * D35 — "Which lookup lists this customer's orders?" — CA-5 Task 5.
 *
 * ⛔ THE SINGLE MOST IMPORTANT PRIVACY CONTROL IN THE PRODUCT, AND IT IS ASKED IN ENGLISH. When an
 * agent types an order number, Odly has no idea whose order it is until something confirms the
 * record appears in THIS customer's own list. Labelled `ownershipSourceEndpointId`, it would be
 * configured by accident or not at all.
 *
 * ⛔ CHOOSING NOTHING IS ALLOWED, and says what it costs. That is the carrier case the owner
 * decided on: a parcel number is not a person, nobody can list "this customer's parcels", and the
 * answer is to SHOW the record marked unverified rather than to refuse it.
 */

interface Props {
  /** The other lookups on this connection. The lookup being edited is never among them. */
  siblings: CustomApiEndpoint[];
  value: number | null;
  onChange: (next: number | null) => void;
}

/** A source can only confirm ownership if we know which of its fields holds the reference. */
export const hasIdentifier = (endpoint: CustomApiEndpoint): boolean =>
  (endpoint.fieldPaths as FieldPick[] | undefined)?.some((field) => field.role === 'identifier') ??
  false;

export const OwnershipStep = ({ siblings, value, onChange }: Props) => {
  const chosen = siblings.find((endpoint) => endpoint.id === value);
  /**
   * ⛔ WARNED AT CONFIGURE TIME, not at lookup time. Without the identifier tag the check has
   * nothing to match on, so it silently resolves to `unverified` for every record — on a lookup
   * that looks fully configured. The admin is two clicks from fixing it here and would never know
   * to look later.
   */
  const sourceCannotMatch = Boolean(chosen) && !hasIdentifier(chosen as CustomApiEndpoint);

  /**
   * ⛔ A QUESTION WITH ONE POSSIBLE ANSWER IS NOT A QUESTION (audit pass 3). With no other lookup
   * on this connection there is nothing to choose, and offering a dropdown containing only "we
   * can't check" reads as a decision the admin made rather than a state they are in — and tells
   * them nothing about how to get out of it.
   */
  if (siblings.length === 0) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-foreground">
          Can we check a record belongs to the customer?
        </p>
        <p className="text-xs text-muted-foreground">
          Not yet — that needs a second lookup on this connection that lists a customer’s own
          records (for example “this customer’s orders”). Until there is one, agents will see
          records here marked <strong>unverified</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="ca-ownership">Which lookup lists this customer’s own records?</Label>
      <Select
        id="ca-ownership"
        value={value === null ? '' : String(value)}
        onChange={(event) =>
          onChange(event.target.value === '' ? null : Number(event.target.value))
        }
      >
        {/*
         * ⛔ The "no" option is FIRST and is a real answer, not an absence. It is the carrier
         * case, and an admin who has no such lookup must not feel they are leaving the form
         * broken.
         */}
        <option value="">We can’t check — show the record marked unverified</option>
        {siblings.map((endpoint) => (
          <option key={endpoint.id} value={endpoint.id}>
            {endpoint.label}
          </option>
        ))}
      </Select>

      {value === null ? (
        <p className="text-xs text-muted-foreground">
          Odly cannot confirm a record belongs to the customer who wrote in, so agents will see it
          marked <strong>unverified</strong>. That is the right answer when the number is not tied
          to a person — a parcel number, for instance.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Before showing a record, Odly will check it appears in this customer’s own list.
        </p>
      )}

      {sourceCannotMatch && (
        <Alert variant="warning">
          <AlertDescription>
            “{chosen?.label}” does not have a field tagged as the number the customer quotes, so we
            would have nothing to match on and every record would still show as unverified. Open
            that lookup and tag its number field.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};
