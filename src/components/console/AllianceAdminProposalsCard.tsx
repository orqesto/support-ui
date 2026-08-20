import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAllianceAdminProposals, useChangeMemberRole } from '@/hooks/useAllianceAdmin';
import type { AllianceAdminProposal } from '@/services/alliance-admin.service';

/**
 * Members the WORKSPACE grants already describe as alliance administrators — org-admin on more
 * than one workspace of this alliance — who do not hold the alliance power.
 *
 * 🔑 A proposal, never an automatic grant. Alliance admin carries SSO config, SCIM tokens,
 * domains, group authoring and the audit log. Deriving it and applying it silently would mean
 * attaching a second workspace to an org-admin group hands alliance administration to everyone
 * in that group at the next reconcile, with nobody deciding — the mirror image of the implicit
 * "associate everywhere" floor that was removed, and the more dangerous direction.
 *
 * Renders nothing when there are no proposals, so it never occupies the page with an empty
 * state — including on a backend that predates the endpoint, where the service returns [].
 */
/** Name when there is one, else the address — a SCIM push can arrive without given/family name. */
const displayName = (proposal: AllianceAdminProposal): string =>
  proposal.name.trim().length > 0 ? proposal.name : proposal.email;

export const AllianceAdminProposalsCard = ({ allianceId }: { allianceId: number }) => {
  const proposalsQuery = useAllianceAdminProposals(allianceId);
  const changeRole = useChangeMemberRole(allianceId);
  const [confirming, setConfirming] = useState<AllianceAdminProposal | null>(null);

  const proposals = proposalsQuery.data ?? [];
  if (proposals.length === 0) return null;

  const workspaceList = (proposal: AllianceAdminProposal) =>
    proposal.adminOf.map((org) => org.orgName).join(', ');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex gap-2 items-center">
          <ShieldAlert className="w-5 h-5 text-primary" />
          Suggested alliance admins
        </CardTitle>
        <CardDescription>
          These members already administer more than one workspace of this alliance, which is what
          being an alliance admin means. Granting it is a decision, not a calculation — nothing
          changes until you confirm.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {proposals.map((proposal) => (
          <Card key={proposal.userId} padding="sm" className="flex flex-wrap gap-3 justify-between items-center">
            <div className="min-w-0">
              <p className="font-medium text-foreground">{displayName(proposal)}</p>
              <p className="text-xs truncate text-muted-foreground">{proposal.email}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Workspace admin of <strong className="text-foreground">{workspaceList(proposal)}</strong>
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConfirming(proposal)}
              disabled={changeRole.isPending}
            >
              Make alliance admin
            </Button>
          </Card>
        ))}

        <Alert variant="info">
          <span className="text-sm">
            Alliance admin is alliance-wide: SSO and SCIM configuration, bearer tokens, domains,
            group authoring and the audit log — across every workspace, including ones attached
            later.
          </span>
        </Alert>
      </CardContent>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
        onConfirm={() => {
          if (!confirming) return;
          changeRole.mutate(
            { userId: confirming.userId, allianceRole: 'alliance_admin' },
            { onSuccess: () => void proposalsQuery.refetch() }
          );
          setConfirming(null);
        }}
        variant="danger"
        confirmText="Make alliance admin"
        title={`Make ${confirming ? displayName(confirming) : 'this member'} an alliance admin?`}
        description="They gain alliance-wide control: SSO and SCIM configuration, bearer tokens, domains, group authoring and the audit log, across every workspace in this alliance including ones attached later. You can change it back from the Members tab."
      />
    </Card>
  );
};
