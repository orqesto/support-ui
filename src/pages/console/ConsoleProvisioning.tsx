import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ShieldCheck,
  KeyRound,
  UserCog,
  Copy,
  Check,
  Trash2,
  Plus,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Tooltip } from '@/components/ui/Tooltip';
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { ConsolePageHeader } from '@/components/console/ConsolePageHeader';
import { ScimEventLedgerCard } from '@/components/console/ScimEventLedgerCard';
import { ScimTelemetryCard } from '@/components/console/ScimTelemetryCard';
import { AllianceAdminProposalsCard } from '@/components/console/AllianceAdminProposalsCard';
import { SyncedGroupsCard } from '@/components/console/SyncedGroupsCard';
import { useAllianceGroups } from '@/hooks/useAllianceGroups';
import {
  useAllianceScimConfig,
  useAllianceScimTelemetry,
  useSaveAllianceScimConfig,
  useAllianceScimTokens,
  useMintAllianceScimToken,
  useRevokeAllianceScimToken,
  useAllianceRoleMaps,
  useDeleteAllianceRoleMap,
} from '@/hooks/useAllianceProvisioning';
import { allianceScimBaseUrl, type AllianceRoleMapping } from '@/services/alliance-scim.service';

/**
 * Alliance Provisioning section (05-08, REQ-05 + D-05, the config surface for the
 * 05-07 backend). Generalizes the per-org SCIMConfigSettings to alliance scope:
 *
 *  - SCIM Base URL — copy-able; the bearer token (not the URL) scopes a push to
 *    this alliance, so the URL matches the per-org connector.
 *  - Config — enable + account-linking flags.
 *  - Bearer tokens — the RAW token is surfaced ONCE in a Dialog on mint and is never
 *    re-fetchable (T-05-28); a list with revoke (ConfirmDialog).
 *  - IdP-group → alliance-group maps — one IdP group external id → one alliance
 *    group (feeds the reconciler's group-grant union).
 *  - IdP-group → alliance_role maps — LEGACY, read-only, remove-only. New ones cannot
 *    be created from anywhere: the layer collapsed (Role-Model v2 §0.2) and the alliance
 *    power is now derived from the workspaces a member administers, surfaced as proposals
 *    above. Existing mappings stay listed so nothing grants invisibly, and stay removable
 *    so they can drain to zero. Migration 0089 already deleted the agent rows.
 */

/** A read-only, monospace, copy-able value (the SCIM base URL). */
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
        <Tooltip content={copied ? 'Copied' : `Copy ${label}`}>
          <Button type="button" variant="secondary" onClick={() => void copy()} aria-label={`Copy ${label}`}>
            {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
          </Button>
        </Tooltip>
      </div>
    </div>
  );
};

/** Discriminated confirm target — one ConfirmDialog serves tokens + the legacy role maps. */
type ConfirmTarget =
  | { kind: 'token'; id: number; label: string }
  | { kind: 'rolemap'; id: number; label: string };

export const ConsoleProvisioning = () => {
  const { allianceId } = useParams();
  const numericId = allianceId ? Number(allianceId) : null;

  const configQuery = useAllianceScimConfig(numericId);
  const telemetryQuery = useAllianceScimTelemetry(numericId);
  const saveConfig = useSaveAllianceScimConfig(numericId);
  const tokensQuery = useAllianceScimTokens(numericId);
  const mintToken = useMintAllianceScimToken(numericId);
  const revokeToken = useRevokeAllianceScimToken(numericId);

  const groupsQuery = useAllianceGroups(numericId);
  const roleMapsQuery = useAllianceRoleMaps(numericId);
  const deleteRoleMap = useDeleteAllianceRoleMap(numericId);

  // Token mint UI.
  const [tokenLabel, setTokenLabel] = useState('');
  // Transient: the freshly-minted plaintext token to show ONCE, then cleared.
  const [mintedToken, setMintedToken] = useState<string | null>(null);
  const [mintedCopied, setMintedCopied] = useState(false);

  const [confirm, setConfirm] = useState<ConfirmTarget | null>(null);

  const scimBaseUrl = useMemo(() => allianceScimBaseUrl(), []);

  const isLoading =
    configQuery.isLoading ||
    tokensQuery.isLoading ||
    roleMapsQuery.isLoading ||
    groupsQuery.isLoading;
  const isError =
    configQuery.isError ||
    tokensQuery.isError ||
    roleMapsQuery.isError ||
    groupsQuery.isError;

  const handleMint = () => {
    mintToken.mutate(tokenLabel.trim() || undefined, {
      onSuccess: (minted) => {
        // Show the plaintext ONCE. Never persist it beyond this transient state.
        setMintedToken(minted.token);
        setTokenLabel('');
      },
    });
  };

  const copyMinted = async () => {
    if (!mintedToken) {
      return;
    }
    try {
      await navigator.clipboard.writeText(mintedToken);
      setMintedCopied(true);
      setTimeout(() => setMintedCopied(false), 1500);
    } catch {
      /* clipboard blocked — the field is selectable */
    }
  };

  const handleConfirm = () => {
    if (!confirm) {
      return;
    }
    if (confirm.kind === 'token') {
      revokeToken.mutate(confirm.id);
    } else if (confirm.kind === 'rolemap') {
      deleteRoleMap.mutate(confirm.id);
    }
    // Every arm is explicit on purpose. This used to end in a bare `else` that granted
    // alliance-admin, so a confirm kind added later and left unhandled would have
    // silently elevated an IdP group.
    setConfirm(null);
  };

  if (isLoading) {
    return <ConsoleLoading />;
  }

  if (isError) {
    return (
      <Alert variant="danger">
        <div className="flex gap-3 justify-between items-center">
          <span>Couldn&apos;t load provisioning settings.</span>
          <Button
            variant="secondary"
            onClick={() => {
              void configQuery.refetch();
              void tokensQuery.refetch();
              void roleMapsQuery.refetch();
            }}
          >
            Retry
          </Button>
        </div>
      </Alert>
    );
  }

  const config = configQuery.data;
  const tokens = tokensQuery.data ?? [];
  const roleMaps = roleMapsQuery.data ?? [];
  const anyAdminRoleMap = roleMaps.some((mapping) => mapping.mappedRole === 'alliance_admin');

  return (
    <div className="space-y-6">
      <ConsolePageHeader
        title="Provisioning"
        description="Connect SCIM once for the whole alliance, then map your identity provider's groups to alliance groups and roles."
      />

      {/* ─── SCIM connector ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center">
            <ShieldCheck className="w-5 h-5 text-primary" />
            SCIM connector
          </CardTitle>
          <CardDescription>
            Point your identity provider (Okta, Entra, JumpCloud) at the SCIM Base URL below and
            authenticate with a bearer token. The token scopes every push to this alliance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CopyField label="SCIM Base URL" value={scimBaseUrl} />

          <Toggle
            checked={config?.enabled ?? false}
            disabled={saveConfig.isPending}
            onChange={(next) => saveConfig.mutate({ enabled: next })}
            label="Enable SCIM provisioning for this alliance"
          />

          <div className="space-y-1">
            <Toggle
              checked={config?.allowScimAccountLinking ?? false}
              disabled={saveConfig.isPending}
              onChange={(next) => saveConfig.mutate({ allowScimAccountLinking: next })}
              label="Allow linking to existing accounts"
            />
            <p className="pl-11 text-xs text-muted-foreground">
              When on, a SCIM POST for a member who already has an account adopts that account
              (matched by verified email) instead of failing. Leave off unless you trust your IdP to
              claim existing accounts.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ─── Provisioning telemetry (read-only) ──────────────────────────── */}
      {telemetryQuery.data && <ScimTelemetryCard telemetry={telemetryQuery.data} />}

      {/* ─── Synced ("draft") IdP groups — visibility + one-click wire ─────── */}
      {numericId !== null && <SyncedGroupsCard allianceId={numericId} />}

      {numericId !== null && <AllianceAdminProposalsCard allianceId={numericId} />}

      {/* ─── Connector event ledger (read-only; 404-tolerant, hides on old BE) ─ */}
      <ScimEventLedgerCard allianceId={numericId} telemetry={telemetryQuery.data} />

      {/* ─── Bearer tokens ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center">
            <KeyRound className="w-5 h-5 text-primary" />
            Bearer tokens
          </CardTitle>
          <CardDescription>
            Generate a bearer token to paste into your IdP&apos;s SCIM connection. The token is shown
            only once at creation — copy it immediately.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Input
                label="New token label (optional)"
                type="text"
                placeholder="e.g. Okta production"
                value={tokenLabel}
                onChange={(event) => setTokenLabel(event.target.value)}
              />
            </div>
            <Button type="button" onClick={handleMint} isLoading={mintToken.isPending} disabled={mintToken.isPending}>
              <Plus className="mr-2 w-4 h-4" />
              Generate token
            </Button>
          </div>

          {tokens.length === 0 ? (
            <p className="text-xs text-muted-foreground">No tokens yet.</p>
          ) : (
            <Card padding="none" className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Label</th>
                    <th className="px-3 py-2 font-medium">Last used</th>
                    <th className="px-3 py-2 font-medium">Created</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((token) => {
                    const revoked = token.revokedAt !== null;
                    return (
                      <tr key={token.id} className="border-t border-border">
                        <td className="px-3 py-2">
                          <span className={revoked ? 'text-muted-foreground line-through' : undefined}>
                            {token.label ?? '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleString() : 'Never'}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {new Date(token.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {revoked ? (
                            <Badge variant="secondary">Revoked</Badge>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setConfirm({ kind: 'token', id: token.id, label: token.label ?? 'this token' })
                              }
                              aria-label="Revoke token"
                            >
                              <Trash2 className="mr-1 w-3.5 h-3.5" />
                              Revoke
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </CardContent>
      </Card>

      {/* ─── IdP-group → alliance_role maps (D-05 elevation) ─────────────── */}
      {/* Legacy only. Rendered ONLY while a legacy mapping still exists: with nothing to
          retire, a card that says "nothing to retire here" is a paragraph about a feature
          that no longer exists — the customer's devops read it as something left unremoved. */}
      {roleMaps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex gap-2 items-center">
              <UserCog className="w-5 h-5 text-primary" />
              IdP group → alliance role
            </CardTitle>
            <CardDescription>
              Legacy mappings that still grant an alliance role to members of an IdP group. New ones
              are no longer created here — the alliance power now follows from the workspaces a
              member administers, proposed above. Remove a mapping to retire it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {anyAdminRoleMap && (
              <Alert variant="warning">
                <div className="flex gap-2 items-start">
                  <AlertTriangle className="mt-0.5 w-4 h-4 shrink-0" />
                  <span className="text-sm">
                    A mapping below still grants <strong>alliance admin</strong> across{' '}
                    <strong>all workspaces in this alliance</strong> on every SCIM sync. Nothing
                    creates these any more — remove it once its members are confirmed from the
                    proposals above.
                  </span>
                </div>
              </Alert>
            )}

            {roleMaps.length > 0 && (
              <div className="space-y-3">
                {roleMaps.map((mapping: AllianceRoleMapping) => (
                  <Card key={mapping.id} padding="sm" className="flex flex-wrap gap-3 items-end">
                    <div className="flex-1 min-w-[12rem]">
                      <Label className="mb-1">IdP group</Label>
                      {mapping.idpGroupDisplayName ? (
                        <p className="mb-1 text-sm font-medium truncate text-foreground">
                          {mapping.idpGroupDisplayName}
                        </p>
                      ) : null}
                      <Input readOnly value={mapping.idpGroupExternalId} className="font-mono text-xs" />
                    </div>
                    <div className="flex-1 min-w-[12rem]">
                      <Label className="mb-1">Alliance role</Label>
                      {/* Read-out, not a control. The alliance power is derived from workspace
                          grants and confirmed in "Suggested alliance admins" — wiring an IdP group
                          straight to an alliance role is the layer that collapsed. Existing
                          mappings stay visible and removable so nothing grants invisibly. */}
                      <p className="py-2 text-sm font-medium text-foreground">
                        {mapping.mappedRole === 'alliance_admin' ? 'Alliance admin' : 'Member'}
                      </p>
                    </div>
                    <Tooltip content={`Remove role mapping for ${mapping.idpGroupExternalId}`}>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setConfirm({
                            kind: 'rolemap',
                            id: mapping.id,
                            label: mapping.idpGroupExternalId,
                          })
                        }
                        aria-label={`Remove role mapping for ${mapping.idpGroupExternalId}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </Tooltip>
                  </Card>
                ))}
              </div>
            )}

            {roleMaps.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No IdP group is mapped to an alliance role. Nothing to retire here — alliance
                admin now comes from <strong>Suggested alliance admins</strong> above.
              </p>
            )}
          </CardContent>
        </Card>
      )}
      {/* One-time raw-token reveal — never re-fetchable (T-05-28). */}
      <Dialog open={mintedToken !== null} onOpenChange={(open) => !open && setMintedToken(null)}>
        <DialogHeader>
          <DialogTitle>Copy your SCIM token</DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <Alert variant="warning">
            <span className="text-sm">
              This token is shown <strong>only once</strong>. Copy it now and store it in your IdP —
              you cannot retrieve it again.
            </span>
          </Alert>
          <div className="flex gap-2 items-center">
            <Input
              readOnly
              value={mintedToken ?? ''}
              onFocus={(event) => event.currentTarget.select()}
              className="font-mono text-xs"
            />
            <Tooltip content={mintedCopied ? 'Copied' : 'Copy token'}>
              <Button type="button" variant="secondary" onClick={() => void copyMinted()} aria-label="Copy token">
                {mintedCopied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              </Button>
            </Tooltip>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button type="button" onClick={() => setMintedToken(null)}>
            Done
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Shared confirm for token revoke + mapping removals. */}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        onConfirm={handleConfirm}
        variant="danger"
        confirmText={confirm?.kind === 'token' ? 'Revoke token' : 'Remove mapping'}
        title={
          confirm?.kind === 'token'
            ? `Revoke ${confirm.label}?`
            : `Remove mapping for ${confirm?.label ?? ''}?`
        }
        description={
          confirm?.kind === 'token'
            ? 'Any IdP connection using this token will stop syncing immediately. This cannot be undone.'
            : confirm?.kind === 'rolemap'
              ? 'Members of this IdP group will no longer be granted this alliance role on future syncs. Already-elevated members keep their role until deprovisioned or manually changed.'
              : 'Members of this IdP group will no longer be added to the alliance group on future syncs.'
        }
      />
    </div>
  );
};
