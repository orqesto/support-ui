import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ShieldCheck,
  KeyRound,
  Users,
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
import { Select } from '@/components/ui/Select';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { Toggle } from '@/components/ui/Toggle';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { useAllianceGroups } from '@/hooks/useAllianceGroups';
import {
  useAllianceScimConfig,
  useSaveAllianceScimConfig,
  useAllianceScimTokens,
  useMintAllianceScimToken,
  useRevokeAllianceScimToken,
  useAllianceGroupMaps,
  useSetAllianceGroupMap,
  useDeleteAllianceGroupMap,
  useAllianceRoleMaps,
  useSetAllianceRoleMap,
  useDeleteAllianceRoleMap,
} from '@/hooks/useAllianceProvisioning';
import {
  allianceScimBaseUrl,
  type AllianceRole,
  type AllianceGroupMapping,
  type AllianceRoleMapping,
} from '@/services/alliance-scim.service';

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
 *  - IdP-group → alliance_role maps (D-05) — the ONLY surface that can raise a
 *    member above alliance_agent. The alliance_admin option carries an explicit
 *    elevation warning (T-05-29): mapped members gain alliance-admin across all
 *    alliance orgs on the next SCIM sync (opt-in).
 */

/** Alliance-role options for the role-map Select. */
const ROLE_OPTIONS: { value: AllianceRole; label: string }[] = [
  { value: 'alliance_agent', label: 'Alliance agent' },
  { value: 'alliance_admin', label: 'Alliance admin (elevated)' },
];

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
        <Button type="button" variant="secondary" onClick={() => void copy()} aria-label={`Copy ${label}`}>
          {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
};

/** Discriminated confirm target — one ConfirmDialog serves token + both mapping tables. */
type ConfirmTarget =
  | { kind: 'token'; id: number; label: string }
  | { kind: 'groupmap'; id: number; label: string }
  | { kind: 'rolemap'; id: number; label: string }
  // Elevating an EXISTING role map to alliance_admin — gated behind the same confirm as
  // deletes because it grants admin across every org in the alliance (T-05-29).
  | { kind: 'elevate'; idpGroupExternalId: string; label: string };

export const ConsoleProvisioning = () => {
  const { allianceId } = useParams();
  const numericId = allianceId ? Number(allianceId) : null;

  const configQuery = useAllianceScimConfig(numericId);
  const saveConfig = useSaveAllianceScimConfig(numericId);
  const tokensQuery = useAllianceScimTokens(numericId);
  const mintToken = useMintAllianceScimToken(numericId);
  const revokeToken = useRevokeAllianceScimToken(numericId);

  const groupsQuery = useAllianceGroups(numericId);
  const groupMapsQuery = useAllianceGroupMaps(numericId);
  const setGroupMap = useSetAllianceGroupMap(numericId);
  const deleteGroupMap = useDeleteAllianceGroupMap(numericId);

  const roleMapsQuery = useAllianceRoleMaps(numericId);
  const setRoleMap = useSetAllianceRoleMap(numericId);
  const deleteRoleMap = useDeleteAllianceRoleMap(numericId);

  // Token mint UI.
  const [tokenLabel, setTokenLabel] = useState('');
  // Transient: the freshly-minted plaintext token to show ONCE, then cleared.
  const [mintedToken, setMintedToken] = useState<string | null>(null);
  const [mintedCopied, setMintedCopied] = useState(false);

  // "Add mapping" drafts.
  const [newGroupExternalId, setNewGroupExternalId] = useState('');
  const [newGroupTargetId, setNewGroupTargetId] = useState('');
  const [newRoleExternalId, setNewRoleExternalId] = useState('');
  const [newRoleValue, setNewRoleValue] = useState<AllianceRole>('alliance_agent');

  const [confirm, setConfirm] = useState<ConfirmTarget | null>(null);

  const scimBaseUrl = useMemo(() => allianceScimBaseUrl(), []);

  const groupOptions = useMemo(
    () => (groupsQuery.data ?? []).map((group) => ({ value: String(group.id), label: group.name })),
    [groupsQuery.data]
  );

  const isLoading =
    configQuery.isLoading ||
    tokensQuery.isLoading ||
    groupMapsQuery.isLoading ||
    roleMapsQuery.isLoading;
  const isError =
    configQuery.isError || tokensQuery.isError || groupMapsQuery.isError || roleMapsQuery.isError;

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

  const handleAddGroupMap = () => {
    const externalId = newGroupExternalId.trim();
    if (!externalId || !newGroupTargetId) {
      return;
    }
    setGroupMap.mutate(
      { groupId: Number(newGroupTargetId), idpGroupExternalId: externalId },
      {
        onSuccess: () => {
          setNewGroupExternalId('');
          setNewGroupTargetId('');
        },
      }
    );
  };

  const handleAddRoleMap = () => {
    const externalId = newRoleExternalId.trim();
    if (!externalId) {
      return;
    }
    setRoleMap.mutate(
      { idpGroupExternalId: externalId, mappedRole: newRoleValue },
      {
        onSuccess: () => {
          setNewRoleExternalId('');
          setNewRoleValue('alliance_agent');
        },
      }
    );
  };

  const handleConfirm = () => {
    if (!confirm) {
      return;
    }
    if (confirm.kind === 'token') {
      revokeToken.mutate(confirm.id);
    } else if (confirm.kind === 'groupmap') {
      deleteGroupMap.mutate(confirm.id);
    } else if (confirm.kind === 'rolemap') {
      deleteRoleMap.mutate(confirm.id);
    } else {
      // Confirmed elevation of an existing mapping to alliance_admin.
      setRoleMap.mutate({
        idpGroupExternalId: confirm.idpGroupExternalId,
        mappedRole: 'alliance_admin',
      });
    }
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
              void groupMapsQuery.refetch();
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
  const groupMaps = groupMapsQuery.data ?? [];
  const roleMaps = roleMapsQuery.data ?? [];
  const newRoleIsAdmin = newRoleValue === 'alliance_admin';
  const anyAdminRoleMap = roleMaps.some((mapping) => mapping.mappedRole === 'alliance_admin');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Provisioning</h1>
        <p className="text-sm text-muted-foreground">
          Connect SCIM once for the whole alliance, then map your identity provider&apos;s groups to
          alliance groups and roles.
        </p>
      </div>

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

      {/* ─── IdP-group → alliance-group maps ─────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center">
            <Users className="w-5 h-5 text-primary" />
            IdP group → alliance group
          </CardTitle>
          <CardDescription>
            Map an identity-provider group to an alliance group. On sync, members of the IdP group are
            added to the alliance group and inherit whatever role that group grants across its
            organizations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {groupOptions.length === 0 && (
            <Alert variant="info">
              <span className="text-sm">
                No alliance groups yet. Create groups in the Groups section first, then map IdP groups
                to them here.
              </span>
            </Alert>
          )}

          {groupMaps.length > 0 && (
            <div className="space-y-3">
              {groupMaps.map((mapping: AllianceGroupMapping) => (
                <Card key={mapping.id} padding="sm" className="flex flex-wrap gap-3 items-end">
                  <div className="flex-1 min-w-[12rem]">
                    <Label className="mb-1">IdP group external id</Label>
                    <Input readOnly value={mapping.idpGroupExternalId} className="font-mono text-xs" />
                  </div>
                  <div className="flex-1 min-w-[12rem]">
                    <Label className="mb-1">Alliance group</Label>
                    <ReactSelect
                      options={groupOptions}
                      value={String(mapping.groupId)}
                      onChange={(value) => {
                        if (value && Number(value) !== mapping.groupId) {
                          setGroupMap.mutate({
                            groupId: Number(value),
                            idpGroupExternalId: mapping.idpGroupExternalId,
                          });
                        }
                      }}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setConfirm({
                        kind: 'groupmap',
                        id: mapping.id,
                        label: mapping.idpGroupExternalId,
                      })
                    }
                    aria-label={`Remove mapping for ${mapping.idpGroupExternalId}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </Card>
              ))}
            </div>
          )}

          {/* Add a mapping. */}
          <div className="flex flex-wrap gap-3 items-end pt-2 border-t border-border">
            <div className="flex-1 min-w-[12rem]">
              <Input
                label="IdP group external id"
                type="text"
                placeholder="e.g. eng-team or a group GUID"
                value={newGroupExternalId}
                onChange={(event) => setNewGroupExternalId(event.target.value)}
              />
            </div>
            <div className="flex-1 min-w-[12rem]">
              <Label className="mb-1">Alliance group</Label>
              <ReactSelect
                options={groupOptions}
                value={newGroupTargetId}
                onChange={setNewGroupTargetId}
                placeholder="Select a group…"
              />
            </div>
            <Button
              type="button"
              onClick={handleAddGroupMap}
              isLoading={setGroupMap.isPending}
              disabled={setGroupMap.isPending || !newGroupExternalId.trim() || !newGroupTargetId}
            >
              <Plus className="mr-2 w-4 h-4" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ─── IdP-group → alliance_role maps (D-05 elevation) ─────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center">
            <UserCog className="w-5 h-5 text-primary" />
            IdP group → alliance role
          </CardTitle>
          <CardDescription>
            Grant an alliance role to members of an IdP group. This is the only way IdP sync can raise
            a member above the default alliance-agent floor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(anyAdminRoleMap || newRoleIsAdmin) && (
            <Alert variant="warning">
              <div className="flex gap-2 items-start">
                <AlertTriangle className="mt-0.5 w-4 h-4 shrink-0" />
                <span className="text-sm">
                  Members of an IdP group mapped to <strong>alliance admin</strong> will gain
                  alliance-admin rights across <strong>all organizations in this alliance</strong> on
                  the next SCIM sync. Only map groups you intend to elevate.
                </span>
              </div>
            </Alert>
          )}

          {roleMaps.length > 0 && (
            <div className="space-y-3">
              {roleMaps.map((mapping: AllianceRoleMapping) => (
                <Card key={mapping.id} padding="sm" className="flex flex-wrap gap-3 items-end">
                  <div className="flex-1 min-w-[12rem]">
                    <Label className="mb-1">IdP group external id</Label>
                    <Input readOnly value={mapping.idpGroupExternalId} className="font-mono text-xs" />
                  </div>
                  <div className="flex-1 min-w-[12rem]">
                    <Label htmlFor={`role-${mapping.id}`} className="mb-1">
                      Alliance role
                    </Label>
                    <Select
                      id={`role-${mapping.id}`}
                      value={mapping.mappedRole}
                      onChange={(event) => {
                        const next = event.target.value as AllianceRole;
                        if (next === mapping.mappedRole) {
                          return;
                        }
                        // Elevating an existing mapping to alliance_admin must be a
                        // deliberate, confirmed action (grants admin across every org).
                        if (next === 'alliance_admin') {
                          setConfirm({
                            kind: 'elevate',
                            idpGroupExternalId: mapping.idpGroupExternalId,
                            label: mapping.idpGroupExternalId,
                          });
                          return;
                        }
                        setRoleMap.mutate({
                          idpGroupExternalId: mapping.idpGroupExternalId,
                          mappedRole: next,
                        });
                      }}
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </div>
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
                </Card>
              ))}
            </div>
          )}

          {/* Add a mapping. */}
          <div className="flex flex-wrap gap-3 items-end pt-2 border-t border-border">
            <div className="flex-1 min-w-[12rem]">
              <Input
                label="IdP group external id"
                type="text"
                placeholder="e.g. alliance-admins or a group GUID"
                value={newRoleExternalId}
                onChange={(event) => setNewRoleExternalId(event.target.value)}
              />
            </div>
            <div className="flex-1 min-w-[12rem]">
              <Label htmlFor="new-role" className="mb-1">
                Alliance role
              </Label>
              <Select
                id="new-role"
                value={newRoleValue}
                onChange={(event) => setNewRoleValue(event.target.value as AllianceRole)}
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              type="button"
              onClick={handleAddRoleMap}
              isLoading={setRoleMap.isPending}
              disabled={setRoleMap.isPending || !newRoleExternalId.trim()}
            >
              <Plus className="mr-2 w-4 h-4" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

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
            <Button type="button" variant="secondary" onClick={() => void copyMinted()} aria-label="Copy token">
              {mintedCopied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
            </Button>
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
        confirmText={
          confirm?.kind === 'token'
            ? 'Revoke token'
            : confirm?.kind === 'elevate'
              ? 'Grant alliance admin'
              : 'Remove mapping'
        }
        title={
          confirm?.kind === 'token'
            ? `Revoke ${confirm.label}?`
            : confirm?.kind === 'elevate'
              ? `Elevate ${confirm.label} to alliance admin?`
              : `Remove mapping for ${confirm?.label ?? ''}?`
        }
        description={
          confirm?.kind === 'token'
            ? 'Any IdP connection using this token will stop syncing immediately. This cannot be undone.'
            : confirm?.kind === 'elevate'
              ? 'Members of this IdP group will gain alliance-admin rights across every organization in this alliance on the next SCIM sync. Only confirm if you intend to elevate them.'
              : confirm?.kind === 'rolemap'
                ? 'Members of this IdP group will no longer be granted this alliance role on future syncs. Already-elevated members keep their role until deprovisioned or manually changed.'
                : 'Members of this IdP group will no longer be added to the alliance group on future syncs.'
        }
      />
    </div>
  );
};
