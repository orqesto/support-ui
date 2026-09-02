import { useState } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import type { SecretSaveResult, SecretStatus } from '@/services/platformSettings.service';

/**
 * Masked platform-secret field. The value is NEVER displayed — only a status (configured +
 * source + last4). Typing a new value and pressing Save stores it (encrypted server-side);
 * Clear removes a console-set secret so resolution falls back to the environment.
 *
 * ⛔ Saving is no longer unconditional, and this field must not pretend otherwise. The backend
 * checks the credential against its provider first and refuses a rejected one — on 2026-09-02 a
 * password-manager autofill landed in this field when it was cleared, saved cleanly, showed as
 * configured, and managed AI answered 401 for four hours. So there are THREE outcomes to render,
 * not two: verified, stored-but-unproven, and refused. A single green badge for all three is the
 * habit that hid the defect.
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
  /** Resolves with what the backend proved; rejects when the provider refused the value. */
  onSave: (value: string, options?: { force?: boolean }) => Promise<SecretSaveResult | void>;
  onClear: () => void;
  saving?: boolean;
  clearing?: boolean;
  disabled?: boolean;
}) => {
  const [value, setValue] = useState('');
  const [rejection, setRejection] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ verified: boolean; reason?: string } | null>(null);
  const busy = saving || clearing || disabled;

  const save = async (force?: boolean) => {
    setOutcome(null);
    try {
      const result = await onSave(value, force ? { force: true } : undefined);
      // ⛔ Only clear the field on SUCCESS. Wiping it on a refusal made the admin retype a long
      // key to try again — and retyping is exactly when a password manager fills it for you.
      setValue('');
      setRejection(null);
      const verification = result && 'verification' in result ? result.verification : undefined;
      setOutcome(
        verification?.checked
          ? { verified: true }
          : { verified: false, reason: verification?.reason }
      );
    } catch (err) {
      setRejection(err instanceof Error ? err.message : 'The credential could not be saved.');
    }
  };

  return (
    <div>
      <div className="flex gap-2 items-center mb-2 flex-wrap">
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
        {/*
          A stored row that will not decrypt is NOT what traffic sends — the badge above already
          names the value that resolves. Without this the console simply forgot a key an admin
          knows they saved, which reads as "it lost my key" rather than "it cannot read it".
        */}
        {status.storedValueUnusable && (
          <Badge variant="warning" size="sm">
            A stored value can’t be read — not in use
          </Badge>
        )}
      </div>
      <div className="flex gap-2 items-center">
        <Input
          type="password"
          autoComplete="new-password"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setRejection(null);
            setOutcome(null);
          }}
          placeholder={status.configured ? 'Enter a new value to replace' : 'Enter a value'}
          disabled={busy}
          className="flex-1"
        />
        <Button
          variant="secondary"
          onClick={() => void save()}
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

      {rejection && (
        <div className="mt-2 p-3 rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
          <div className="flex gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-red-600 dark:text-red-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-red-800 dark:text-red-300">{rejection}</p>
              {/*
                The override exists because the check is only as available as the provider is.
                It is a deliberate second press, not a dialog to click through.
              */}
              <Button
                variant="ghost"
                size="sm"
                className="mt-1"
                onClick={() => void save(true)}
                disabled={busy}
              >
                Save anyway
              </Button>
            </div>
          </div>
        </div>
      )}

      {outcome && (
        <p className="mt-2 text-xs text-muted-foreground flex gap-1 items-start">
          {outcome.verified ? (
            <>
              <ShieldCheck className="w-3.5 h-3.5 mt-0.5 text-green-600 dark:text-green-400 flex-shrink-0" />
              <span>Saved, and the provider accepted it.</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-amber-600 dark:text-amber-500 flex-shrink-0" />
              <span>
                Saved, but not verified.
                {outcome.reason ? ` ${outcome.reason}` : ''}
              </span>
            </>
          )}
        </p>
      )}
    </div>
  );
};
