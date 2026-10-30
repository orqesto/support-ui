import { Input } from '@/components/ui/Input';
import { Toggle } from '@/components/ui/Toggle';
import {
  DEFAULT_MARK_IMPORTED_LABEL,
  MARK_IMPORTED_LABEL_MAX,
  type MarkImportedSetting,
} from '@/components/settings/integrations/markImported';

/**
 * The "mark imported messages read and label them" switch (support-service#1229), with the label
 * name once it is on. One control for the IMAP form and the Gmail row, so they cannot drift.
 */
export const MarkImportedControl = ({
  value,
  onChange,
  disabled,
  note,
}: {
  value: MarkImportedSetting;
  onChange: (next: MarkImportedSetting) => void;
  disabled?: boolean;
  /** Why it is disabled, or anything else the reader needs next to it. */
  note?: string;
}) => (
  <div className="space-y-2">
    <Toggle
      checked={value.enabled}
      disabled={disabled}
      onChange={(enabled) => onChange({ ...value, enabled })}
      label="Mark imported messages as read and label them in the mailbox"
    />
    <p className="text-xs text-muted-foreground">
      {note ??
        'Every message Odly imports from now on is marked read and gets this label, so people working in the mailbox can see what Odly already has.'}
    </p>
    {value.enabled && (
      <Input
        label="Label"
        value={value.label ?? ''}
        placeholder={DEFAULT_MARK_IMPORTED_LABEL}
        maxLength={MARK_IMPORTED_LABEL_MAX}
        disabled={disabled}
        onChange={(event) => onChange({ ...value, label: event.target.value })}
      />
    )}
  </div>
);
