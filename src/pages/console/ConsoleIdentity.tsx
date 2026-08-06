import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { KeyRound, ShieldCheck, Copy, Check, Trash2, Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Label } from '@/components/ui/Label';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Toggle } from '@/components/ui/Toggle';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { API_BASE_URL } from '@/lib/config';
import { useAllianceOverview } from '@/hooks/useAllianceAdmin';
import {
  useAllianceSso,
  useSaveAllianceSso,
  useAllianceDomains,
  useAddDomain,
  useVerifyDomain,
  useRemoveDomain,
} from '@/hooks/useAllianceIdentity';
import {
  txtRecordName,
  expectedTxtValue,
  type AllianceDomain,
} from '@/services/alliance-sso.service';

/**
 * Alliance Identity section (05-06, REQ-04 connect-once + LOCKED-3 domain verify).
 *
 * Generalizes the per-org SSOConfigSettings to alliance scope on top of the 05-05
 * backend. The client secret is WRITE-ONLY: GET never returns it (only
 * `hasClientSecret`), the input only ever holds what the admin TYPES, and a blank
 * secret on save keeps the stored ciphertext (T-05-25). The copy-able Redirect URI
 * is derived from the backend origin + the alliance slug (matching the BE
 * buildAllianceRedirectUri). The domain panel derives the exact DNS-TXT name/value
 * to publish from the raw token (the BE sends the token, not the derived strings).
 */

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
  if (issuer === 'https://accounts.google.com') {
    return 'google';
  }
  try {
    const host = new URL(issuer).host;
    if (host === 'login.microsoftonline.com') {
      return 'entra';
    }
    if (host.endsWith('.okta.com') || host.endsWith('.oktapreview.com')) {
      return 'okta';
    }
    if (host.endsWith('.auth0.com')) {
      return 'auth0';
    }
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

/** The backend origin the alliance callback is served from (matches BE buildAllianceRedirectUri). */
const backendOrigin = API_BASE_URL.replace(/\/$/, '');

/** A read-only, monospace, copy-able value (redirect URI + DNS TXT name/value). */
const CopyField = ({ label, value }: { label: string; value: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the field is selectable as a fallback */
    }
  };
  return (
    <div className="space-y-1">
      <Label className="mb-1">{label}</Label>
      <div className="flex gap-2 items-center">
        <Input
          readOnly
          value={value}
          onFocus={(event) => event.currentTarget.select()}
          className="font-mono text-xs"
        />
        <Button type="button" variant="secondary" onClick={() => void copy()} aria-label={`Copy ${label}`}>
          {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
};

const DomainRow = ({ allianceId, domain }: { allianceId: number | null; domain: AllianceDomain }) => {
  const verify = useVerifyDomain(allianceId);
  const remove = useRemoveDomain(allianceId);
  const verified = domain.verifiedAt !== null;

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex gap-3 justify-between items-center">
          <div className="font-medium text-foreground">{domain.domain}</div>
          <div className="flex gap-2 items-center">
            <Badge variant={verified ? 'success' : 'secondary'}>{verified ? 'Verified' : 'Pending'}</Badge>
            {!verified && (
              <Button
                variant="secondary"
                onClick={() => verify.mutate(domain.id)}
                isLoading={verify.isPending}
                disabled={verify.isPending}
              >
                Verify
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => remove.mutate(domain.id)}
              disabled={remove.isPending}
              aria-label={`Remove ${domain.domain}`}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
        {!verified && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Publish this DNS TXT record, then click Verify. DNS changes can take a few minutes.
            </p>
            <CopyField label="TXT record name" value={txtRecordName(domain.domain)} />
            <CopyField label="TXT record value" value={expectedTxtValue(domain.txtToken)} />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export const ConsoleIdentity = () => {
  const { allianceId } = useParams();
  const numericId = allianceId ? Number(allianceId) : null;

  const overview = useAllianceOverview(numericId);
  const ssoQuery = useAllianceSso(numericId);
  const saveSso = useSaveAllianceSso(numericId);
  const domainsQuery = useAllianceDomains(numericId);
  const addDomain = useAddDomain(numericId);

  // OIDC form state. clientSecret is write-only — it only ever holds typed input.
  const [enabled, setEnabled] = useState(false);
  const [issuerUrl, setIssuerUrl] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [scopes, setScopes] = useState('');
  const [domainsText, setDomainsText] = useState('');
  const [jitProvisioning, setJitProvisioning] = useState(true);
  const [allowSsoAccountLinking, setAllowSsoAccountLinking] = useState(false);
  const [hasClientSecret, setHasClientSecret] = useState(false);
  const [provider, setProvider] = useState('custom');

  const [newDomain, setNewDomain] = useState('');

  // Hydrate the form from the fetched config once; NEVER bind the secret (it's redacted).
  useEffect(() => {
    const config = ssoQuery.data;
    if (!config) {
      return;
    }
    setEnabled(config.enabled);
    setIssuerUrl(config.issuerUrl);
    setClientId(config.clientId);
    setScopes(config.scopes ?? '');
    setDomainsText(config.allowedEmailDomains.join('\n'));
    setJitProvisioning(config.jitProvisioning);
    setAllowSsoAccountLinking(config.allowSsoAccountLinking);
    setHasClientSecret(config.hasClientSecret);
    setProvider(inferProvider(config.issuerUrl));
  }, [ssoQuery.data]);

  const redirectUri = useMemo(() => {
    const slug = overview.data?.slug;
    return slug ? `${backendOrigin}/api/auth/sso/alliance/${slug}/callback` : '';
  }, [overview.data?.slug]);

  const providerHint = PROVIDERS.find((prov) => prov.id === provider)?.hint;

  const applyProvider = (id: string) => {
    setProvider(id);
    const preset = PROVIDERS.find((prov) => prov.id === id);
    if (!preset || id === 'custom') {
      return;
    }
    setIssuerUrl(preset.issuer);
    setScopes(preset.scopes);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmedSecret = clientSecret.trim();
    saveSso.mutate(
      {
        enabled,
        issuerUrl: issuerUrl.trim(),
        clientId: clientId.trim(),
        // Omit when blank → BE keeps the existing ciphertext (write-only).
        ...(trimmedSecret ? { clientSecret: trimmedSecret } : {}),
        ...(scopes.trim() ? { scopes: scopes.trim() } : {}),
        allowedEmailDomains: parseDomains(domainsText),
        jitProvisioning,
        allowSsoAccountLinking,
      },
      {
        onSuccess: (config) => {
          // Refresh derived state from the redacted response; NEVER re-populate the secret.
          setHasClientSecret(config.hasClientSecret);
          setClientSecret('');
        },
      }
    );
  };

  const handleAddDomain = (event: FormEvent) => {
    event.preventDefault();
    const domain = newDomain.trim().toLowerCase();
    if (!domain) {
      return;
    }
    addDomain.mutate(domain, { onSuccess: () => setNewDomain('') });
  };

  if (ssoQuery.isLoading || domainsQuery.isLoading) {
    return <Spinner size={20} />;
  }

  if (ssoQuery.isError || domainsQuery.isError) {
    return (
      <Alert variant="danger">
        <div className="flex gap-3 justify-between items-center">
          <span>Couldn&apos;t load identity settings.</span>
          <Button
            variant="secondary"
            onClick={() => {
              void ssoQuery.refetch();
              void domainsQuery.refetch();
            }}
          >
            Retry
          </Button>
        </div>
      </Alert>
    );
  }

  const domains = domainsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Identity</h1>
        <p className="text-sm text-muted-foreground">
          Connect your identity provider once for the whole alliance, and verify the email domains it governs.
        </p>
      </div>

      {/* ─── OIDC connection ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center">
            <KeyRound className="w-5 h-5 text-primary" />
            OIDC connection
          </CardTitle>
          <CardDescription>
            Connect an OIDC identity provider once. Members across all organizations in this alliance whose
            email domain matches sign in through your provider. The client secret is stored encrypted and is
            never shown again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Toggle
              checked={enabled}
              onChange={setEnabled}
              label="Enable SSO for this alliance"
            />

            {redirectUri && <CopyField label="Redirect / callback URL" value={redirectUri} />}
            <p className="-mt-1 text-xs text-muted-foreground">
              Register this exact URL as the redirect / callback URI in your identity provider.
            </p>

            <div className="space-y-1">
              <Label htmlFor="sso-provider" className="mb-1">
                Identity provider
              </Label>
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

            <div className="space-y-1">
              <Input
                label="Client Secret"
                type="password"
                autoComplete="new-password"
                placeholder={hasClientSecret ? '•••• (configured)' : 'Enter the client secret'}
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {hasClientSecret
                  ? 'A secret is already configured. Leave blank to keep it, or enter a new one to replace it.'
                  : 'Required to complete the connection.'}
              </p>
            </div>

            <Textarea
              label="Allowed email domains"
              value={domainsText}
              onChange={(event) => setDomainsText(event.target.value)}
              rows={3}
              placeholder={'example.com\nsubsidiary.example.com'}
            />
            <p className="-mt-2 text-xs text-muted-foreground">
              One per line (or comma-separated). Users with these email domains are routed to SSO.
            </p>

            <Input
              label="Scopes (optional)"
              type="text"
              placeholder="openid email profile"
              value={scopes}
              onChange={(event) => setScopes(event.target.value)}
            />

            <div className="space-y-1">
              <Toggle
                checked={jitProvisioning}
                onChange={setJitProvisioning}
                label="Just-in-time provisioning (create members on first SSO login)"
              />
            </div>

            <div className="space-y-1">
              <Toggle
                checked={allowSsoAccountLinking}
                onChange={setAllowSsoAccountLinking}
                label="Allow linking to existing accounts"
              />
              <p className="pl-11 text-xs text-muted-foreground">
                When on, a member who already has a password login can sign in through your provider (matched
                by verified email) and their account is linked on first SSO login. Leave off unless you trust
                your IdP to authenticate existing accounts.
              </p>
            </div>

            <Button type="submit" isLoading={saveSso.isPending} disabled={saveSso.isPending}>
              Save SSO settings
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ─── Domain verification ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Verified domains
          </CardTitle>
          <CardDescription>
            Prove the alliance owns an email domain via a DNS-TXT record so that domain safely governs which
            alliance a user&apos;s email resolves to at SSO login.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleAddDomain} className="flex gap-2 items-end">
            <div className="flex-1">
              <Input
                label="Add a domain"
                type="text"
                placeholder="example.com"
                value={newDomain}
                onChange={(event) => setNewDomain(event.target.value)}
              />
            </div>
            <Button type="submit" isLoading={addDomain.isPending} disabled={addDomain.isPending || !newDomain.trim()}>
              <Plus className="mr-2 w-4 h-4" />
              Add
            </Button>
          </form>

          {domains.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No domains yet. Add one to publish its DNS-TXT challenge and verify ownership.
            </p>
          ) : (
            <div className="space-y-3">
              {domains.map((domain) => (
                <DomainRow key={domain.id} allianceId={numericId} domain={domain} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
