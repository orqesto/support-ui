import { Input } from '@/components/ui/Input';
import type { ReferenceName } from './useReferenceName';

/**
 * D4 (2026-10-14): the "Reference name" input, for a typed-value lookup only. Blank ⇒ agents
 * read "Reference".
 */
export const ReferenceNameField = ({ reference }: { reference: ReferenceName }) =>
  reference.shown ? (
    <div className="space-y-1">
      <Input
        label="Reference name"
        value={reference.value}
        maxLength={40}
        onChange={(event) => reference.setValue(event.target.value)}
        placeholder="Reference"
      />
      <p className="text-xs text-muted-foreground">
        What your agents call the value they type for this lookup — for example a ticket id or a
        tracking number. It names the field and the “not found” line agents see.
      </p>
    </div>
  ) : null;
