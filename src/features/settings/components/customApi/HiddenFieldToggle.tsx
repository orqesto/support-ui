import { Toggle } from '@/components/ui/Toggle';

/**
 * 2026-11-13 (owner): a picked field the CHECKS read but agents never see — typically the order's
 * email tagged “Customer’s email”, which decides ownership and need not sit on every order card.
 * The backend leaves a hidden field out of the card's rows and field list; its role still counts.
 * ⛔ Sent only when on (`hidden: true`); switched off it is removed, so a field reads as shown,
 * exactly like every field saved before the flag existed.
 */
export const HiddenFieldToggle = ({
  field,
  onChange,
}: {
  /** A picked field (`FieldPick`), by the two keys this reads — no cross-feature import needed. */
  field: { path: string; hidden?: boolean };
  onChange: (path: string, patch: { hidden?: boolean }) => void;
}) => (
  <Toggle
    checked={field.hidden === true}
    onChange={(next: boolean) => onChange(field.path, { hidden: next ? true : undefined })}
    label={`Hide ${field.path} from agents — use it only for checks`}
  />
);
