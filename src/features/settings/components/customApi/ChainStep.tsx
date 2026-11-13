import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { CustomApiEndpoint, FieldPick } from '@/features/custom-api/shell';

/**
 * D21 — "take the value from another lookup's answer".
 *
 * 🔴 WHY IT EXISTS. Militech lists a customer's orders by `user` = customer_id, and the only way to
 * learn a customer_id is to look the customer up by their email first. Without a chain the orders
 * lookup had to be TYPED by an agent who had first read the id off another card — found configuring
 * it against the real vendor on 2026-09-28.
 *
 * ⛔ ONLY A LOOKUP THAT FINDS THE CUSTOMER BY THEIR EMAIL AND RETURNS ONE RECORD can be a source.
 * The backend refuses anything else (a typed source has nothing to be called with when the panel
 * opens; a many-result source has no single value to read), so offering it here would be offering
 * a save that fails.
 */

/** Where the value goes in a path — the wizard's own constant, copied: importing it would be a cycle. */
const VALUE_PLACEHOLDER = '{value}';

interface Props {
  /** The other lookups on this connection. The lookup being edited is never among them. */
  siblings: CustomApiEndpoint[];
  sourceEndpointId: number | null;
  sourceFieldPath: string;
  /** 2026-11-13: the path called with the customer's email when the source finds no account. */
  fallbackPath: string;
  /** Whether this lookup tags a field “Customer’s email” — the fallback's ownership check reads it. */
  hasEmailField: boolean;
  onChange: (next: {
    sourceEndpointId: number | null;
    sourceFieldPath: string;
    fallbackPath: string;
  }) => void;
}

/** The same rule the backend's `assertChainIsValid` applies. */
export const canFeedAChain = (endpoint: CustomApiEndpoint): boolean =>
  endpoint.parameterSource === 'identity' && endpoint.resultShape === 'one';

export const ChainStep = ({
  siblings,
  sourceEndpointId,
  sourceFieldPath,
  fallbackPath,
  hasEmailField,
  onChange,
}: Props) => {
  const current = { sourceEndpointId, sourceFieldPath, fallbackPath };
  const fallbackSet = fallbackPath.trim() !== '';
  const sources = siblings.filter(canFeedAChain);
  const chosen = sources.find((endpoint) => endpoint.id === sourceEndpointId);
  // The fields an admin already picked on the source are the likeliest answers; offered as
  // shortcuts, never as the only choice — the value to read need not be one agents are shown.
  const suggestions = ((chosen?.fieldPaths as FieldPick[] | undefined) ?? []).map(
    (field) => field.path
  );

  if (sources.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        This needs another lookup on this connection that finds the customer by their email and
        returns one record — for example “Customer account”. Add that one first.
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <Select
        id="ca-chain-source"
        label="Which lookup gives the value?"
        placeholder="Choose…"
        clearable
        value={sourceEndpointId === null ? '' : String(sourceEndpointId)}
        options={sources.map((endpoint) => ({
          value: String(endpoint.id),
          label: endpoint.label,
        }))}
        onChange={(value) =>
          onChange({ ...current, sourceEndpointId: value === '' ? null : Number(value) })
        }
      />
      <Input
        label="Which field of its answer holds the value?"
        value={sourceFieldPath}
        onChange={(event) => onChange({ ...current, sourceFieldPath: event.target.value })}
        placeholder="customer_id"
      />
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {suggestions.map((path) => (
            <Button
              key={path}
              size="sm"
              variant="ghost"
              onClick={() => onChange({ ...current, sourceFieldPath: path })}
            >
              {path}
            </Button>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        When an agent opens a ticket we run {chosen ? `“${chosen.label}”` : 'that lookup'} with the
        customer’s email, read this field from its answer, and look this one up with it. If that
        lookup finds nobody, this one shows “no match” too — unless you set a fallback below.
      </p>
      {/*
        2026-11-13: the fallback. Generic on purpose: the admin writes the path, and which field is
        "the record's email" is their own “Customer’s email” tag — nothing here names a vendor.
      */}
      <Input
        label="If it finds no account, search by email instead (optional)"
        value={fallbackPath}
        onChange={(event) => onChange({ ...current, fallbackPath: event.target.value })}
        placeholder={`/orders?email=${VALUE_PLACEHOLDER}`}
      />
      <p className="text-xs text-muted-foreground">
        A path on this connection, with {VALUE_PLACEHOLDER} where the customer’s email goes. It is
        used only when {chosen ? `“${chosen.label}”` : 'that lookup'} finds no account, and its
        results show on this card. We show only results whose “Customer’s email” field is exactly
        the customer’s email; the rest are hidden and counted.
      </p>
      {fallbackSet && !fallbackPath.includes(VALUE_PLACEHOLDER) && (
        <p role="alert" className="text-xs text-destructive">
          Put {VALUE_PLACEHOLDER} in the fallback path where the email goes.
        </p>
      )}
      {fallbackSet && !hasEmailField && (
        <p role="alert" className="text-xs text-destructive">
          Tag the field holding each result’s email as “Customer’s email” below. Without it the
          fallback cannot check whose results they are, so it shows nothing.
        </p>
      )}
    </div>
  );
};
