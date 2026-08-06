import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Copy, Check, Trash2, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { departmentService, type Department } from '@/services/department.service';
import { organizationService } from '@/services/organization.service';
import {
  getScimConfig,
  updateScimConfig,
  mintScimToken,
  revokeScimToken,
  listScimGroupMappings,
  setScimGroupMapping,
  clearScimGroupMapping,
  type ScimTokenMeta,
  type ScimGroupMapping,
  type OrgRole,
} from '@/services/scim.service';
import { useAuthStore } from '@/stores/authStore';
import { logger } from '@/lib/logger';

/**
 * org_admin SCIM 2.0 provisioning card.
 *
 * - Enable toggle + the account-linking toggle (default OFF, with a warning).
 * - A read-only, copyable SCIM Base URL (derived server-side) to paste into the IdP.
 * - Token lifecycle: "Generate token" reveals the plaintext ONCE in a copyable
 *   field then never again (T-02-22 — the plaintext lives only in transient
 *   component state and is never refetched); a table of existing tokens with revoke.
 * - A group-mapping table: each synced SCIM group maps to a role + departments.
 *   Empty state until the IdP first pushes a Group.
 *
 * FE role visibility is UX-only — the BE `requireOrgAdmin` gate is the real
 * authority (T-02-21).
 */

const inputCls =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground';

const ROLE_OPTIONS: { value: OrgRole | ''; label: string }[] = [
  { value: '', label: '— no role —' },
  { value: 'org_admin', label: 'Org admin' },
  { value: 'moderator', label: 'Moderator' },
  { value: 'support', label: 'Support' },
  { value: 'associate', label: 'Associate' },
];

export const SCIMConfigSettings = () => {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin' || user?.organizationRole === 'org_admin';

  // Alliance membership drives the read-only flip (see SSOConfigSettings). `undefined`
  // = loading; a number = member org (SCIM managed by the alliance console — LOCKED-6);
  // null = standalone. Cosmetic reinforcement; the BE resolver is the real guard.
  const [allianceId, setAllianceId] = useState<number | null | undefined>(undefined);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [allowLinking, setAllowLinking] = useState(false);
  const [savingFlags, setSavingFlags] = useState(false);

  const [scimBaseUrl, setScimBaseUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const [tokens, setTokens] = useState<ScimTokenMeta[]>([]);
  const [tokenLabel, setTokenLabel] = useState('');
  const [minting, setMinting] = useState(false);
  // Transient: holds a freshly-minted plaintext token to show ONCE, then cleared.
  const [mintedToken, setMintedToken] = useState<string | null>(null);
  const [mintedCopied, setMintedCopied] = useState(false);

  const [groups, setGroups] = useState<ScimGroupMapping[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [savingGroupId, setSavingGroupId] = useState<number | null>(null);

  // Resolve alliance membership first. On error, fail open to the editable tab.
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
    // Only load the per-org SCIM config for standalone orgs; member orgs render the
    // read-only "managed by your alliance" state instead.
    if (!isAdmin || allianceId !== null) return;
    let active = true;
    Promise.all([getScimConfig(), listScimGroupMappings(), departmentService.getAll()])
      .then(([configResp, groupList, deptList]) => {
        if (!active) return;
        setEnabled(configResp.config.enabled);
        setAllowLinking(configResp.config.allowScimAccountLinking);
        setScimBaseUrl(configResp.scimBaseUrl);
        setTokens(configResp.config.tokens);
        setGroups(groupList);
        setDepartments(deptList);
      })
      .catch((err: unknown) => {
        if (!active) return;
        logger.error('Failed to load SCIM config', err);
        setError('Failed to load SCIM configuration.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isAdmin, allianceId]);

  const copyBaseUrl = async () => {
    try {
      await navigator.clipboard.writeText(scimBaseUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the field is selectable as a fallback */
    }
  };

  const saveFlags = async (next: { enabled?: boolean; allowScimAccountLinking?: boolean }) => {
    setSavingFlags(true);
    setError(null);
    try {
      const config = await updateScimConfig(next);
      setEnabled(config.enabled);
      setAllowLinking(config.allowScimAccountLinking);
    } catch (err: unknown) {
      logger.error('Failed to save SCIM config', err);
      setError(err instanceof Error ? err.message : 'Failed to save SCIM configuration.');
    } finally {
      setSavingFlags(false);
    }
  };

  const handleMint = async () => {
    setMinting(true);
    setError(null);
    setMintedToken(null);
    try {
      const minted = await mintScimToken(tokenLabel.trim() || undefined);
      // Show the plaintext ONCE. Never store it beyond this transient state.
      setMintedToken(minted.token);
      setTokens((prev) => [
        { id: minted.id, label: minted.label, lastUsedAt: null, createdAt: minted.createdAt },
        ...prev,
      ]);
      setTokenLabel('');
    } catch (err: unknown) {
      logger.error('Failed to mint SCIM token', err);
      setError(err instanceof Error ? err.message : 'Failed to generate token.');
    } finally {
      setMinting(false);
    }
  };

  const copyMinted = async () => {
    if (!mintedToken) return;
    try {
      await navigator.clipboard.writeText(mintedToken);
      setMintedCopied(true);
      setTimeout(() => setMintedCopied(false), 1500);
    } catch {
      /* clipboard blocked — the field is selectable */
    }
  };

  const handleRevoke = async (tokenId: number) => {
    setError(null);
    try {
      await revokeScimToken(tokenId);
      setTokens((prev) => prev.filter((token) => token.id !== tokenId));
    } catch (err: unknown) {
      logger.error('Failed to revoke SCIM token', err);
      setError(err instanceof Error ? err.message : 'Failed to revoke token.');
    }
  };

  const persistGroupMapping = async (
    groupId: number,
    role: OrgRole | null,
    deptIds: number[]
  ) => {
    setSavingGroupId(groupId);
    setError(null);
    try {
      // No role AND no departments ⇒ clear the mapping entirely.
      const updated =
        role === null && deptIds.length === 0
          ? await clearScimGroupMapping(groupId)
          : await setScimGroupMapping(groupId, {
              mappedRole: role,
              mappedDepartmentIds: deptIds,
            });
      setGroups((prev) => prev.map((group) => (group.id === groupId ? updated : group)));
    } catch (err: unknown) {
      logger.error('Failed to save group mapping', err);
      setError(err instanceof Error ? err.message : 'Failed to save the group mapping.');
    } finally {
      setSavingGroupId(null);
    }
  };

  const onRoleChange = (group: ScimGroupMapping, value: string) => {
    const role = value === '' ? null : (value as OrgRole);
    void persistGroupMapping(group.id, role, group.mappedDepartmentIds);
  };

  const onDeptToggle = (group: ScimGroupMapping, deptId: number, checked: boolean) => {
    const next = checked
      ? [...group.mappedDepartmentIds, deptId]
      : group.mappedDepartmentIds.filter((id) => id !== deptId);
    void persistGroupMapping(group.id, group.mappedRole, next);
  };

  if (!isAdmin) return null;

  // Member org (alliance-governed): SCIM is managed by the alliance console.
  // Read-only state — no editable card is rendered. Reversible on detach (LOCKED-6).
  if (allianceId !== null && allianceId !== undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center">
            <Users className="w-5 h-5 text-purple-600" />
            SCIM Provisioning
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
                to={`/console/alliance/${allianceId}/provisioning`}
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex gap-2 items-center">
          <Users className="w-5 h-5 text-purple-600" />
          SCIM Provisioning
        </CardTitle>
        <CardDescription>
          Automatically provision and de-provision members from your identity provider (Okta,
          Entra, JumpCloud). Configure the SCIM Base URL + a bearer token in your IdP, then map
          synced groups to in-app roles and departments.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-2 text-sm text-muted-foreground">Loading SCIM configuration…</p>
        ) : (
          <div className="space-y-6">
            {error && (
              <div className="p-3 text-sm rounded-md text-destructive bg-destructive/10">{error}</div>
            )}

            {/* Enable + account-linking flags. */}
            <div className="space-y-3">
              <label className="flex gap-3 items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  disabled={savingFlags}
                  onChange={(event) => void saveFlags({ enabled: event.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium text-foreground">
                  Enable SCIM provisioning for this workspace
                </span>
              </label>

              <div className="space-y-1">
                <label className="flex gap-3 items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowLinking}
                    disabled={savingFlags}
                    onChange={(event) =>
                      void saveFlags({ allowScimAccountLinking: event.target.checked })
                    }
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium text-foreground">
                    Allow linking to existing accounts
                  </span>
                </label>
                <p className="pl-7 text-xs text-muted-foreground">
                  When on, a SCIM POST for a member who already has an account adopts that account
                  (matched by verified email) instead of failing. Leave off unless you trust your IdP
                  to claim existing accounts.
                </p>
              </div>
            </div>

            {/* SCIM Base URL — authoritative, server-derived, copyable. */}
            <div className="space-y-1">
              <label htmlFor="scim-base-url" className="text-sm font-medium text-foreground">
                SCIM Base URL
              </label>
              <div className="flex gap-2 items-center">
                <input
                  id="scim-base-url"
                  readOnly
                  value={scimBaseUrl}
                  onFocus={(event) => event.currentTarget.select()}
                  className={`${inputCls} font-mono text-xs`}
                />
                <button
                  type="button"
                  onClick={copyBaseUrl}
                  title="Copy"
                  className="flex shrink-0 gap-1 items-center px-3 py-2 text-sm rounded-md border border-border hover:bg-muted"
                >
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Paste this exact URL into your IdP's SCIM connection settings.
              </p>
            </div>

            {/* Token section. */}
            <div className="space-y-3">
              <div className="flex gap-2 items-center text-sm font-medium text-foreground">
                <KeyRound className="w-4 h-4 text-muted-foreground" />
                Bearer tokens
              </div>

              {/* One-time plaintext reveal after minting. */}
              {mintedToken && (
                <div className="p-3 space-y-2 rounded-md border border-green-500/40 bg-green-50">
                  <p className="text-xs font-medium text-green-800">
                    Copy this token now — it will not be shown again.
                  </p>
                  <div className="flex gap-2 items-center">
                    <input
                      readOnly
                      value={mintedToken}
                      onFocus={(event) => event.currentTarget.select()}
                      className={`${inputCls} font-mono text-xs`}
                    />
                    <button
                      type="button"
                      onClick={copyMinted}
                      title="Copy"
                      className="flex shrink-0 gap-1 items-center px-3 py-2 text-sm rounded-md border border-border hover:bg-muted"
                    >
                      {mintedCopied ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMintedToken(null)}
                    className="text-xs underline text-muted-foreground"
                  >
                    Done — hide token
                  </button>
                </div>
              )}

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
                <Button type="button" onClick={handleMint} isLoading={minting} disabled={minting}>
                  Generate token
                </Button>
              </div>

              {tokens.length === 0 ? (
                <p className="text-xs text-muted-foreground">No tokens yet.</p>
              ) : (
                <div className="overflow-hidden rounded-md border border-border">
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
                      {tokens.map((token) => (
                        <tr key={token.id} className="border-t border-border">
                          <td className="px-3 py-2">{token.label ?? '—'}</td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {token.lastUsedAt
                              ? new Date(token.lastUsedAt).toLocaleString()
                              : 'Never'}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {new Date(token.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => void handleRevoke(token.id)}
                              title="Revoke"
                              className="inline-flex gap-1 items-center text-xs text-destructive hover:underline"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Revoke
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Group → (role, departments) mapping. */}
            <div className="space-y-3">
              <div className="text-sm font-medium text-foreground">Group mappings</div>
              {groups.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No groups synced yet — they appear here after your IdP first pushes a Group.
                </p>
              ) : (
                <div className="space-y-3">
                  {groups.map((group) => (
                    <div key={group.id} className="p-3 space-y-3 rounded-md border border-border">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="text-sm font-medium text-foreground">
                            {group.displayName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {group.memberCount} member{group.memberCount === 1 ? '' : 's'}
                          </div>
                        </div>
                        {savingGroupId === group.id && (
                          <span className="text-xs text-muted-foreground">Saving…</span>
                        )}
                      </div>

                      <div className="space-y-1">
                        <label
                          htmlFor={`scim-role-${group.id}`}
                          className="text-xs font-medium text-muted-foreground"
                        >
                          Role
                        </label>
                        <select
                          id={`scim-role-${group.id}`}
                          value={group.mappedRole ?? ''}
                          disabled={savingGroupId === group.id}
                          onChange={(event) => onRoleChange(group, event.target.value)}
                          className={inputCls}
                        >
                          {ROLE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {departments.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-xs font-medium text-muted-foreground">
                            Departments
                          </span>
                          <div className="flex flex-wrap gap-3">
                            {departments.map((dept) => (
                              <label
                                key={dept.id}
                                className="flex gap-2 items-center text-sm cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={group.mappedDepartmentIds.includes(dept.id)}
                                  disabled={savingGroupId === group.id}
                                  onChange={(event) =>
                                    onDeptToggle(group, dept.id, event.target.checked)
                                  }
                                  className="w-4 h-4"
                                />
                                <span className="text-foreground">{dept.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
