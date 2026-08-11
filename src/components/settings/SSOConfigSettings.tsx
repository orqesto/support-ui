import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Copy, Check, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import {
  getSsoConfig,
  putSsoConfig,
  testSsoConfig,
  type SsoTestResult,
} from '@/services/sso.service';
import { organizationService } from '@/services/organization.service';
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
 *
 * Setup aids (all authoritative / server-checked, never a substitute for the BE):
 *   - the Redirect URI to register at the IdP is derived server-side and shown here,
 *   - "Test connection" runs a real (SSRF-guarded) discovery probe before saving,
 *   - provider presets prefill the Issuer URL template + scopes per provider.
 */

const inputCls =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground';

/** Provider presets — prefill the Issuer URL template + scopes and show a per-provider hint. */
const PROVIDERS: { id: string; label: string; issuer: string; scopes: string; hint: string }[] = [
  { id: 'custom', label: 'Custom / other', issuer: '', scopes: '', hint: '' },
  {
    id: 'google',
    label: 'Google',
    issuer: 'https://accounts.google.com',
    scopes: 'openid email profile',
    hint: 'Create an OAuth 2.0 Client ID (type: Web application) in Google Cloud Console. The issuer is fixed.',
  },
  {
    id: 'entra',
    label: 'Microsoft Entra ID',
    issuer: 'https://login.microsoftonline.com/TENANT_ID/v2.0',
    scopes: 'openid email profile',
    hint: 'Replace TENANT_ID with your Directory (tenant) ID from the Entra app registration → Endpoints.',
  },
  {
    id: 'okta',
    label: 'Okta',
    issuer: 'https://YOUR_DOMAIN.okta.com/oauth2/default',
    scopes: 'openid email profile',
    hint: 'Replace YOUR_DOMAIN.okta.com with your Okta domain. Use "default" or your custom authorization-server id.',
  },
  {
    id: 'auth0',
    label: 'Auth0',
    issuer: 'https://YOUR_TENANT.auth0.com',
    scopes: 'openid email profile',
    hint: 'Replace YOUR_TENANT (include region if applicable, e.g. YOUR_TENANT.eu.auth0.com). Create a Regular Web Application.',
  },
];

/** Best-effort match of a stored issuer back to a preset (for display on load). */
const inferProvider = (issuer: string): string => {
  if (issuer === 'https://accounts.google.com') return 'google';
  try {
    const host = new URL(issuer).host;
    if (host === 'login.microsoftonline.com') return 'entra';
    if (host.endsWith('.okta.com') || host.endsWith('.oktapreview.com')) return 'okta';
    if (host.endsWith('.auth0.com')) return 'auth0';
  } catch {
    /* not a full URL yet */
  }
  return 'custom';
};

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

  // Alliance membership drives the read-only flip. `undefined` = still loading the
  // org; a number = member org (identity managed by the alliance console — LOCKED-6);
  // null = standalone (fully-editable tab). The BE resolver precedence is the real
  // guard; this flip is cosmetic reinforcement, reversible on detach.
  const [allianceId, setAllianceId] = useState<number | null | undefined>(undefined);

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

  // Setup aids.
  const [redirectUri, setRedirectUri] = useState('');
  const [provider, setProvider] = useState('custom');
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<SsoTestResult | null>(null);

  // Resolve alliance membership first. On error, fail open to the editable tab
  // (the BE per-org endpoints stay guarded regardless).
  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    organizationService
      .getCurrent()
      .then((org) => {
        if (active) setAllianceId(org.allianceId ?? null);
      })
      .catch((err: unknown) => {
        logger.error('Failed to load organization for alliance check', err);
        if (active) setAllianceId(null);
      });
    return () => {
      active = false;
    };
  }, [isAdmin]);

  useEffect(() => {
    // Only load the per-org SSO config for standalone orgs; member orgs render the
    // read-only "managed by your alliance" state instead.
    if (!isAdmin || allianceId !== null) return;
    let active = true;
    getSsoConfig()
      .then(({ config, redirectUri: uri }) => {
        if (!active) return;
        setRedirectUri(uri);
        if (config) {
          setEnabled(config.enabled);
          setIssuerUrl(config.issuerUrl);
          setClientId(config.clientId);
          setScopes(config.scopes ?? '');
          setDomainsText(config.allowedEmailDomains.join('\n'));
          setJitProvisioning(config.jitProvisioning);
          setAllowSsoAccountLinking(config.allowSsoAccountLinking);
          setHasClientSecret(config.hasClientSecret);
          setProvider(inferProvider(config.issuerUrl));
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
  }, [isAdmin, allianceId]);

  // Selecting a provider prefills the Issuer URL template + scopes. Clears any prior
  // test result since the target changed.
  const applyProvider = (id: string) => {
    setProvider(id);
    setTestResult(null);
    const preset = PROVIDERS.find((prov) => prov.id === id);
    if (!preset || id === 'custom') return;
    setIssuerUrl(preset.issuer);
    setScopes(preset.scopes);
  };

  const copyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(redirectUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the field is selectable as a fallback */
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testSsoConfig({
        issuerUrl: issuerUrl.trim(),
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim() || undefined,
      });
      setTestResult(result);
    } catch (err: unknown) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Test failed. Please try again.',
      });
    } finally {
      setTesting(false);
    }
  };

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

  // Member org (alliance-governed): identity is managed by the alliance console.
  // Read-only state — no editable form is rendered. Reversible on detach (LOCKED-6).
  if (allianceId !== null && allianceId !== undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center">
            <ShieldCheck className="w-5 h-5 text-purple-600" />
            Single Sign-On (SSO)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="info">
            <div className="space-y-2">
              <p className="text-sm">
                Identity for this workspace is managed by your alliance. Configure it in the Alliance
                console.
              </p>
              <Link
                to={`/console/alliance/${allianceId}/identity`}
                className="inline-flex gap-1 items-center text-sm font-medium underline text-primary hover:no-underline"
              >
                Open the Alliance console
              </Link>
            </div>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const providerHint = PROVIDERS.find((prov) => prov.id === provider)?.hint;

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
              <span className="text-sm font-medium text-foreground">Enable SSO for this workspace</span>
            </label>

            {/* Redirect URI to register at the IdP — authoritative (derived server-side). */}
            <div className="space-y-1">
              <label htmlFor="sso-redirect" className="text-sm font-medium text-foreground">
                Redirect / callback URL
              </label>
              <div className="flex gap-2 items-center">
                <input
                  id="sso-redirect"
                  readOnly
                  value={redirectUri}
                  onFocus={(event) => event.currentTarget.select()}
                  className={`${inputCls} font-mono text-xs`}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={copyRedirect}
                  title="Copy"
                  aria-label="Copy"
                  className="flex shrink-0 gap-1 items-center px-3 py-2 h-auto text-sm"
                >
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Register this exact URL as the redirect / callback URI in your identity provider.
              </p>
            </div>

            {/* Provider preset — prefills the Issuer URL template + scopes. */}
            <div className="space-y-1">
              <label htmlFor="sso-provider" className="text-sm font-medium text-foreground">
                Identity provider
              </label>
              <Select
                id="sso-provider"
                value={provider}
                onChange={(event) => applyProvider(event.target.value)}
              >
                {PROVIDERS.map((prov) => (
                  <option key={prov.id} value={prov.id}>
                    {prov.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1">
              <Input
                label="Issuer URL"
                type="text"
                placeholder="https://idp.example.com"
                value={issuerUrl}
                onChange={(event) => setIssuerUrl(event.target.value)}
                required
              />
              {providerHint && <p className="text-xs text-muted-foreground">{providerHint}</p>}
            </div>

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
              <Textarea
                id="sso-domains"
                value={domainsText}
                onChange={(event) => setDomainsText(event.target.value)}
                rows={3}
                placeholder={'example.com\nsubsidiary.example.com'}
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

            {/* Pre-save "Test connection" — real SSRF-guarded discovery probe. */}
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTest}
                disabled={testing || !issuerUrl.trim() || !clientId.trim()}
              >
                {testing ? 'Testing…' : 'Test connection'}
              </Button>
              {testResult && (
                <div
                  className={`p-3 text-sm rounded-md ${
                    testResult.ok
                      ? 'text-green-700 bg-green-50'
                      : 'text-destructive bg-destructive/10'
                  }`}
                >
                  {testResult.message}
                  {testResult.ok && testResult.issuer && (
                    <div className="mt-1 font-mono text-xs opacity-80">
                      issuer: {testResult.issuer}
                    </div>
                  )}
                </div>
              )}
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
