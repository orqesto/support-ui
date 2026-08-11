import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import type { SecretStatus } from '@/services/platformSettings.service';

/**
 * Masked platform-secret field. The value is NEVER displayed — only a status
 * (configured + source + last4). Typing a new value and pressing Save stores it
 * (encrypted server-side); Clear removes a console-set secret so resolution falls
 * back to the environment. A console secret overrides env; an env secret can't be
 * cleared from here (there's no DB row to remove).
 */
export const SecretField = ({
  label,
  status,
  onSave,
  onClear,
  saving = false,
  clearing = false,
  disabled = false,
}: {
  label: string;
  status: SecretStatus;
  onSave: (value: string) => void;
  onClear: () => void;
  saving?: boolean;
  clearing?: boolean;
  disabled?: boolean;
}) => {
  const [value, setValue] = useState('');
  const busy = saving || clearing || disabled;

  return (
    <div>
      <div className="flex gap-2 items-center mb-2">
        <Label className="mb-0">{label}</Label>
        {status.configured ? (
          <Badge variant="success" size="sm">
            Set · {status.source === 'db' ? 'Console' : 'Environment'}
            {status.last4 ? ` ····${status.last4}` : ''}
          </Badge>
        ) : (
          <Badge variant="secondary" size="sm">
            Not set
          </Badge>
        )}
      </div>
      <div className="flex gap-2 items-center">
        <Input
          type="password"
          autoComplete="new-password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={status.configured ? 'Enter a new value to replace' : 'Enter a value'}
          disabled={busy}
          className="flex-1"
        />
        <Button
          variant="secondary"
          onClick={() => {
            onSave(value);
            setValue('');
          }}
          isLoading={saving}
          disabled={busy || value.trim().length === 0}
        >
          Save
        </Button>
        {status.configured && status.source === 'db' && (
          <Button variant="ghost" onClick={onClear} isLoading={clearing} disabled={busy}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
};
