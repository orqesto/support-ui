import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { getSsoConfig, putSsoConfig, type SsoConfig } from '@/services/sso.service';
import { useAuthStore } from '@/stores/authStore';
import { logger } from '@/lib/logger';

/**
 * org_admin SSO (OIDC) config card.
 *
 * The client secret is WRITE-ONLY: it is never returned by GET and is NEVER bound
 * into an input from the fetched config. When a secret already exists we show only
 * a "unchanged" placeholder (driven by `hasClientSecret`); saving with the secret
 * field left blank keeps the stored secret (REQ-08, T-05-02). FE role visibility is
 * UX-only — the BE `requireOrgAdmin` gate is the real authority (T-05-03).
 */

const inputCls =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground';

/** Parse a comma/newline-separated domain list into a normalized array. */
const parseDomains = (raw: string): string[] =>
  raw
    .split(/[\n,]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

export const SSOConfigSettings = () => {
  // Defense-in-depth: only org_admin / global-admin may view this card. Uses the same
  // admin signals SettingsPage keys on (users.role === 'admin' | organizationRole ===
  // 'org_admin'). The BE `requireOrgAdmin` gate remains the real authority (T-05-03).
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin' || user?.organizationRole === 'org_admin';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [issuerUrl, setIssuerUrl] = useState('');
  const [clientId, setClientId] = useState('');
  // Write-only. Only ever holds what the admin TYPES — never a fetched secret.
  const [clientSecret, setClientSecret] = useState('');
  const [scopes, setScopes] = useState('');
  const [domainsText, setDomainsText] = useState('');
  const [jitProvisioning, setJitProvisioning] = useState(true);
  // Secure default OFF — linking to an existing member's account is opt-in.
  const [allowSsoAccountLinking, setAllowSsoAccountLinking] = useState(false);
  // Drives the "•••• (unchanged)" placeholder — the secret itself is never held.
  const [hasClientSecret, setHasClientSecret] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    getSsoConfig()
      .then((config: SsoConfig | null) => {
        if (!active) return;
        if (config) {
          setEnabled(config.enabled);
          setIssuerUrl(config.issuerUrl);
          setClientId(config.clientId);
          setScopes(config.scopes ?? '');
          setDomainsText(config.allowedEmailDomains.join('\n'));
          setJitProvisioning(config.jitProvisioning);
          setAllowSsoAccountLinking(config.allowSsoAccountLinking);
          setHasClientSecret(config.hasClientSecret);
          // NOTE: config.clientSecret does not exist — the GET response is redacted.
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        logger.error('Failed to load SSO config', err);
        setError('Failed to load SSO configuration.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isAdmin]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const trimmedSecret = clientSecret.trim();
      const result = await putSsoConfig({
        enabled,
        issuerUrl: issuerUrl.trim(),
        clientId: clientId.trim(),
        // Omit when blank → BE keeps the existing ciphertext (write-only).
        ...(trimmedSecret ? { clientSecret: trimmedSecret } : {}),
        ...(scopes.trim() ? { scopes: scopes.trim() } : {}),
        allowedEmailDomains: parseDomains(domainsText),
        jitProvisioning,
        allowSsoAccountLinking,
      });
      // Refresh derived state from the redacted response; NEVER re-populate the secret.
      setHasClientSecret(result.hasClientSecret);
      setClientSecret('');
      setSaved(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save SSO configuration.';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  // Defense-in-depth: hide the entire card from non-admins.
  if (!isAdmin) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex gap-2 items-center">
          <KeyRound className="w-5 h-5 text-purple-600" />
          Single Sign-On (SSO)
        </CardTitle>
        <CardDescription>
          Connect an OIDC identity provider. Members whose email domain matches will sign in through
          your provider. The client secret is stored encrypted and is never shown again.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-2 text-sm text-muted-foreground">Loading SSO configuration…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="flex gap-3 items-center cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium text-foreground">Enable SSO for this organization</span>
            </label>

            <Input
              label="Issuer URL"
              type="url"
              placeholder="https://idp.example.com"
              value={issuerUrl}
              onChange={(event) => setIssuerUrl(event.target.value)}
              required
            />

            <Input
              label="Client ID"
              type="text"
              placeholder="your-oidc-client-id"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              required
            />

            <Input
              label="Client Secret"
              type="password"
              autoComplete="new-password"
              placeholder={hasClientSecret ? '•••• (unchanged)' : 'Enter the client secret'}
              value={clientSecret}
              onChange={(event) => setClientSecret(event.target.value)}
              // Not required — a blank value keeps the stored secret (write-only).
            />
            <p className="-mt-2 text-xs text-muted-foreground">
              {hasClientSecret
                ? 'A secret is already stored. Leave blank to keep it, or enter a new one to replace it.'
                : 'Required to complete the connection.'}
            </p>

            <div className="space-y-1">
              <label htmlFor="sso-domains" className="text-sm font-medium text-foreground">
                Allowed email domains
              </label>
              <textarea
                id="sso-domains"
                value={domainsText}
                onChange={(event) => setDomainsText(event.target.value)}
                rows={3}
                placeholder={'example.com\nsubsidiary.example.com'}
                className={inputCls}
              />
              <p className="text-xs text-muted-foreground">
                One per line (or comma-separated). Users with these email domains are routed to SSO.
              </p>
            </div>

            <Input
              label="Scopes (optional)"
              type="text"
              placeholder="openid email profile"
              value={scopes}
              onChange={(event) => setScopes(event.target.value)}
            />

            <label className="flex gap-3 items-center cursor-pointer">
              <input
                type="checkbox"
                checked={jitProvisioning}
                onChange={(event) => setJitProvisioning(event.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium text-foreground">
                Just-in-time provisioning (create members on first SSO login)
              </span>
            </label>

            <div className="space-y-1">
              <label className="flex gap-3 items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowSsoAccountLinking}
                  onChange={(event) => setAllowSsoAccountLinking(event.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium text-foreground">
                  Allow linking to existing accounts
                </span>
              </label>
              <p className="pl-7 text-xs text-muted-foreground">
                When on, a member who already has a password login can sign in through your provider
                (matched by verified email) and their account is linked on first SSO login. Leave off
                unless you trust your IdP to authenticate existing accounts.
              </p>
            </div>

            {error && (
              <div className="p-3 text-sm rounded-md text-destructive bg-destructive/10">{error}</div>
            )}
            {saved && !error && (
              <div className="p-3 text-sm text-green-700 rounded-md bg-green-50">
                SSO configuration saved{enabled ? ' and enabled' : ''}.
              </div>
            )}

            <Button type="submit" isLoading={saving} disabled={saving}>
              Save SSO settings
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
};
