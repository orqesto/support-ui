import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { customApiService, type CustomApiConnection } from '@/services/customApi.service';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { useInvalidateCustomApiAvailability } from '@/hooks/useCustomApiLookup';

/**
 * Add or edit a VENDOR — Settings → Integrations → Custom APIs (CA-5 Task 2).
 *
 * ⛔ D40: only an `org_admin` reaches this form. The gate that matters is on the REQUEST (four
 * connection-level routes are `requireOrgAdmin` on the backend); this component not rendering is
 * a courtesy, never the permission.
 *
 * ⛔ D42: a vendor cannot be CREATED without the client acknowledging what connecting it sends
 * out. Not a footnote under the button — a tick the admin has to make, because this is their
 * decision as the data controller and it used to be ours by default.
 *
 * ⛔ THE CREDENTIAL IS WRITE-ONLY, in this form too. On EDIT the field starts EMPTY and an empty
 * field means "keep the stored key" — the backend's three-valued rule. It is never pre-filled
 * with a masked stand-in: a masked value in a form is a value in the DOM.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  /** Absent = creating. Present = editing that vendor. */
  connection?: CustomApiConnection;
  onSaved: () => void;
}

type AuthType = 'none' | 'header' | 'bearer';

export const CustomApiVendorForm = ({ open, onClose, connection, onSaved }: Props) => {
  const editing = Boolean(connection);
  const [name, setName] = useState(connection?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(connection?.baseUrl ?? '');
  const [purpose, setPurpose] = useState(connection?.purpose ?? '');
  const [authType, setAuthType] = useState<AuthType>((connection?.authType as AuthType) ?? 'none');
  const [authHeaderName, setAuthHeaderName] = useState(connection?.authHeaderName ?? '');
  /** ⛔ Always starts empty, editing or not. Empty on save = keep what is stored. */
  const [credential, setCredential] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * What stops a save, and why each one is here:
   * - ⛔ D42 gates the CREATE only. Re-asking on every rename trains an admin to tick without
   *   reading, and the recorded date would then be the rename rather than the decision.
   * - ⛔ A header auth with no header NAME is a connection that cannot authenticate, and the API
   *   accepts creating one (`authHeaderName` is optional), so this form must not be the thing
   *   that creates that state. (Audit pass 2.)
   */
  const blocked =
    !name.trim() ||
    !baseUrl.trim() ||
    (authType === 'header' && !authHeaderName.trim()) ||
    (!editing && !acknowledged);

  const invalidateAvailability = useInvalidateCustomApiAvailability();

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const shared = {
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        purpose: purpose.trim() || null,
        authType,
        /**
         * ⛔ `null`, NEVER `''`. The schema is `min(1).nullable()`, so an empty string is a 400 —
         * and a blank field is exactly what a form posts when the admin came here to rename the
         * vendor and never touched the header name. Confirmed against the API, not reasoned
         * about: a PATCH carrying `authHeaderName: ''` is refused with a validation message
         * about a field they did not edit. (Audit pass 2.)
         */
        authHeaderName: authType === 'header' ? authHeaderName.trim() || null : null,
      };
      if (editing && connection) {
        await customApiService.update(connection.id, {
          ...shared,
          // ⛔ THE THREE-VALUED RULE. Omitted entirely when the admin typed nothing, so renaming
          // an integration cannot silently delete its key and break every lookup under it.
          ...(credential ? { credential } : {}),
        });
      } else {
        await customApiService.create({
          ...shared,
          /**
           * ⛔ DO NOT SEND A SECRET THAT WILL BE DISCARDED (audit pass 15). An admin who typed a
           * key and then chose "it does not need a key" still had it in state, and it went over
           * the wire for the backend to throw away (`authType !== 'none' && credential`). Harmless
           * in outcome and gratuitous in fact: a credential that is never going to be stored
           * should never leave the browser.
           */
          ...(authType !== 'none' && credential ? { credential } : {}),
          piiAcknowledged: true,
        });
      }
      // A create adds a vendor and an update may toggle `enabled`: either can change whether the
      // thread panel should render, so its cached answer must not outlive this save.
      invalidateAvailability();
      onSaved();
      onClose();
    } catch (err) {
      /*
       * ⛔ SHOW WHAT THE BACKEND SAID. It refuses a private or unreachable address in words an
       * admin can act on — naming the address and saying it is not reachable from our servers.
       * A hardcoded "Could not save" here would throw exactly that away and send a paying
       * customer to our support desk, which is what self-serve exists to stop.
       */
      setError(getApiErrorMessage(err) ?? 'Could not save this connection.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()} dismissOnOverlayClick={false}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${connection?.name}` : 'Connect a system'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Our shop"
          />
          <Input
            label="Address"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="https://shop.example.com/api"
          />
          <Input
            label="What is it for? (optional)"
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
            placeholder="Orders and shipping status"
          />

          <div className="space-y-1">
            <Label htmlFor="ca-auth-type">How does it check who we are?</Label>
            <Select
              id="ca-auth-type"
              value={authType}
              onChange={(event) => setAuthType(event.target.value as AuthType)}
            >
              <option value="none">It does not need a key</option>
              <option value="header">An API key in a header</option>
              <option value="bearer">A bearer token</option>
            </Select>
          </div>

          {authType === 'header' && (
            <Input
              label="Header name"
              value={authHeaderName}
              onChange={(event) => setAuthHeaderName(event.target.value)}
              placeholder="X-Api-Key"
            />
          )}

          {authType !== 'none' && (
            <Input
              label={editing ? 'API key — leave blank to keep the current one' : 'API key'}
              type="password"
              value={credential}
              onChange={(event) => setCredential(event.target.value)}
              autoComplete="off"
            />
          )}

          {editing && connection?.hasCredential && (
            <p className="text-xs text-muted-foreground">
              {/* ⛔ Whether a key is set — never the key, and never a masked stand-in. */}A key is
              saved for this connection. We never show it again.
            </p>
          )}

          {!editing && (
            <Alert variant="warning">
              <AlertDescription>
                {/*
                 * `Checkbox`, not `Toggle`: a Toggle reads as a setting that took effect when you
                 * flipped it, and this is a statement the admin makes as part of connecting. The
                 * component did not exist, so it was added to the design system rather than
                 * dropping to a raw input (FE CLAUDE.md).
                 */}
                <Checkbox
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  label={
                    <span className="text-xs">
                      I understand that connecting this system sends our customers’ email addresses
                      to it, and that what it sends back — such as their postal address, phone
                      number and IP address — will be shown to our agents and stored by Odly.
                    </span>
                  }
                />
              </AlertDescription>
            </Alert>
          )}

          <div role="status" aria-live="polite">
            {error && (
              <Alert variant="danger">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={blocked || saving}>
            {saving ? 'Saving…' : editing ? 'Save' : 'Connect'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
