import { useState } from 'react';
import { toast } from 'sonner';
import { ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import systemService, { type StrayAdminMembership } from '@/services/system.service';

/**
 * A global admin must only belong to the internal system org.
 *
 * Rows predating the guards still exist and are load-bearing: `allianceAdminDerivation` and
 * `allianceSeatCap` both EXCLUDE `users.role='admin'`, so the membership is invisible to the
 * derivation and to the seat maths, and SCIM refuses the same account outright. The repair was
 * a script — and a script needs a shell, which a self-hosted deployment does not have.
 *
 * ⛔ Two steps on purpose. The scan is read-only and always runs first, so nobody removes rows
 * they have not seen; the removal is confirmed separately and names the count.
 */
export const GlobalAdminMembershipsCard = () => {
  const [rows, setRows] = useState<StrayAdminMembership[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);

  const scan = async () => {
    setScanning(true);
    try {
      const result = await systemService.listGlobalAdminMemberships();
      setRows(result.data?.memberships ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not read the memberships.');
    } finally {
      setScanning(false);
    }
  };

  const remove = async () => {
    setRemoving(true);
    try {
      const result = await systemService.cleanupGlobalAdminMemberships(true);
      const removed = result.data?.removed ?? 0;
      toast.success(
        removed === 0
          ? 'Nothing to remove.'
          : `Removed ${removed} membership${removed === 1 ? '' : 's'}. Platform roles were not changed.`
      );
      setConfirming(false);
      await scan();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove the memberships.');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex gap-2 items-center">
          <ShieldAlert className="w-5 h-5 text-muted-foreground" />
          Global-admin memberships
        </CardTitle>
        <CardDescription>
          A platform administrator should belong only to the internal system workspace. A membership
          in a customer workspace is invisible to the organisation admin derivation and to the seat
          maths, and the same account cannot be provisioned by SCIM at all.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <Button variant="secondary" size="sm" onClick={() => void scan()} disabled={scanning}>
            {scanning ? 'Scanning…' : 'Scan'}
          </Button>
          {rows !== null && rows.length > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>
              Remove {rows.length} membership{rows.length === 1 ? '' : 's'}
            </Button>
          )}
        </div>

        {rows === null ? (
          <p className="text-xs text-muted-foreground">
            Nothing has been read yet — the scan makes no changes.
          </p>
        ) : rows.length === 0 ? (
          <Alert variant="success">
            <span className="text-sm">
              No platform administrator holds a customer-workspace membership. The invariant holds.
            </span>
          </Alert>
        ) : (
          <ul className="rounded-md border border-border">
            {rows.map((row) => (
              <li
                key={row.membershipId}
                className="px-3 py-2 text-sm border-t border-border first:border-t-0"
              >
                <span className="font-mono text-xs">{row.userEmail}</span>
                <span className="text-muted-foreground"> in </span>
                <strong>{row.organizationName}</strong>
                {!row.active && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    already deactivated
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Remove these memberships?"
        description={`This removes ${rows?.length ?? 0} membership${(rows?.length ?? 0) === 1 ? '' : 's'} and the department links that go with them, across workspaces. It does NOT change anyone's platform role — an account SCIM refuses is refused for being a platform admin, which only a role change resolves.`}
        confirmText={removing ? 'Removing…' : 'Remove'}
        onConfirm={() => {
          if (!removing) void remove();
        }}
      />
    </Card>
  );
};
