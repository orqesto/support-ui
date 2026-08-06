import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Unlink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { ConsoleLoading } from '@/components/console/ConsoleLoading';
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/Dialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  useAllianceOrgs,
  useAttachableOrgs,
  useAttachOrg,
  useDetachOrg,
} from '@/hooks/useAllianceAdmin';
import type { AllianceOrg } from '@/services/alliance-admin.service';

/**
 * Organizations screen (SPEC §8.3): list the alliance's orgs, attach a standalone
 * org the caller may attach (A1-filtered picker), and detach with confirmation.
 */
export const ConsoleOrganizations = () => {
  const { allianceId } = useParams();
  const numericId = allianceId ? Number(allianceId) : null;

  const { data: orgs, isLoading, isError, refetch } = useAllianceOrgs(numericId);
  const [attachOpen, setAttachOpen] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [detachTarget, setDetachTarget] = useState<AllianceOrg | null>(null);

  const { data: attachable = [], isLoading: attachableLoading } = useAttachableOrgs(
    numericId,
    attachOpen
  );
  const attachMutation = useAttachOrg(numericId);
  const detachMutation = useDetachOrg(numericId);

  const attachableOptions = useMemo(
    () => attachable.map((org) => ({ value: String(org.id), label: `${org.name} (/${org.slug})` })),
    [attachable]
  );

  const handleAttach = () => {
    if (selectedOrgId === null) {
      return;
    }
    attachMutation.mutate(selectedOrgId, {
      onSuccess: () => {
        toast.success('Organization attached to the alliance');
        setAttachOpen(false);
        setSelectedOrgId(null);
      },
      onError: (error: unknown) => toast.error(error instanceof Error ? error.message : 'Attach failed'),
    });
  };

  const handleDetach = () => {
    if (!detachTarget) {
      return;
    }
    detachMutation.mutate(detachTarget.id, {
      onSuccess: () => {
        toast.success(`Detached ${detachTarget.name}`);
        setDetachTarget(null);
      },
      onError: (error: unknown) => toast.error(error instanceof Error ? error.message : 'Detach failed'),
    });
  };

  if (isLoading) {
    return <ConsoleLoading />;
  }

  if (isError || !orgs) {
    return (
      <Alert variant="danger">
        <div className="flex gap-3 justify-between items-center">
          <span>Couldn&apos;t load organizations.</span>
          <Button variant="secondary" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-foreground">Organizations</h1>
        <Button onClick={() => setAttachOpen(true)}>
          <Plus className="mr-2 w-4 h-4" />
          Attach organization
        </Button>
      </div>

      {orgs.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No organizations in this alliance yet. Attach a standalone organization to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent padding="none">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="px-4 py-3 font-medium text-left">Organization</th>
                  <th className="px-4 py-3 font-medium text-left">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Members</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((org) => (
                  <tr key={org.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{org.name}</div>
                      <div className="text-xs text-muted-foreground">/{org.slug}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={org.active ? 'success' : 'secondary'}>
                        {org.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-foreground">{org.memberCount}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" onClick={() => setDetachTarget(org)} aria-label={`Detach ${org.name}`}>
                        <Unlink className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={attachOpen} onOpenChange={setAttachOpen}>
        <DialogHeader>
          <DialogTitle>Attach an organization</DialogTitle>
        </DialogHeader>
        <DialogContent>
          {attachableLoading ? (
            <Spinner size={18} />
          ) : attachableOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No standalone organizations you administer are available to attach.
            </p>
          ) : (
            <div className="space-y-4">
              <ReactSelect
                label="Organization"
                options={attachableOptions}
                value={selectedOrgId === null ? '' : String(selectedOrgId)}
                onChange={(value) => setSelectedOrgId(value ? Number(value) : null)}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setAttachOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleAttach}
                  disabled={selectedOrgId === null}
                  isLoading={attachMutation.isPending}
                >
                  Attach
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={detachTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDetachTarget(null);
          }
        }}
        onConfirm={handleDetach}
        variant="danger"
        confirmText="Detach"
        title={`Detach ${detachTarget?.name ?? ''}?`}
        description="Alliance-managed roles in this organization will be unwound (members fall back to any direct grant). This does not delete the organization."
      />
    </div>
  );
};
