import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { CustomApiEndpoint, FieldPick } from '@/services/customApi.service';

/**
 * D21 — "take the value from another lookup's answer".
 *
 * 🔴 WHY IT EXISTS. DeusPower lists a customer's orders by `user` = customer_id, and the only way to
 * learn a customer_id is to look the customer up by their email first. Without a chain the orders
 * lookup had to be TYPED by an agent who had first read the id off another card — found configuring
 * it against the real vendor on 2026-09-28.
 *
 * ⛔ ONLY A LOOKUP THAT FINDS THE CUSTOMER BY THEIR EMAIL AND RETURNS ONE RECORD can be a source.
 * The backend refuses anything else (a typed source has nothing to be called with when the panel
 * opens; a many-result source has no single value to read), so offering it here would be offering
 * a save that fails.
 */

interface Props {
  /** The other lookups on this connection. The lookup being edited is never among them. */
  siblings: CustomApiEndpoint[];
  sourceEndpointId: number | null;
  sourceFieldPath: string;
  onChange: (next: { sourceEndpointId: number | null; sourceFieldPath: string }) => void;
}

/** The same rule the backend's `assertChainIsValid` applies. */
export const canFeedAChain = (endpoint: CustomApiEndpoint): boolean =>
  endpoint.parameterSource === 'identity' && endpoint.resultShape === 'one';

export const ChainStep = ({ siblings, sourceEndpointId, sourceFieldPath, onChange }: Props) => {
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
          onChange({
            sourceEndpointId: value === '' ? null : Number(value),
            sourceFieldPath,
          })
        }
      />
      <Input
        label="Which field of its answer holds the value?"
        value={sourceFieldPath}
        onChange={(event) => onChange({ sourceEndpointId, sourceFieldPath: event.target.value })}
        placeholder="customer_id"
      />
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {suggestions.map((path) => (
            <Button
              key={path}
              size="sm"
              variant="ghost"
              onClick={() => onChange({ sourceEndpointId, sourceFieldPath: path })}
            >
              {path}
            </Button>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        When an agent opens a ticket we run {chosen ? `“${chosen.label}”` : 'that lookup'} with the
        customer’s email, read this field from its answer, and look this one up with it. If that
        lookup finds nobody, this one shows “no match” too.
      </p>
    </div>
  );
};
