import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import type { KeepChoice, PlanFit } from '@/services/subscription.service';
import { defaultKeep, keepProblem, toggleId } from './keepActive';

type KeepActiveDialogProps = {
  open: boolean;
  fit: PlanFit | null;
  currentUserId?: number | null;
  /** `switch`: moving to Free now. `manage`: already on Free, changing who is active. */
  mode: 'switch' | 'manage';
  busy?: boolean;
  onConfirm: (keep: KeepChoice) => void;
  onCancel: () => void;
};

/**
 * Task #8 — choose who and what stays active within a smaller plan. Everything left out is
 * PAUSED, never deleted: paused members cannot sign in to this workspace, paused channels stop
 * receiving mail, and an upgrade brings them back.
 */
export const KeepActiveDialog = ({ open, fit, currentUserId, mode, busy, onConfirm, onCancel }: KeepActiveDialogProps) => {
  const [keep, setKeep] = useState<KeepChoice>({ memberUserIds: [], sourceIds: [] });

  useEffect(() => {
    if (open && fit) {
      // Opening on the current active set while managing; on the default choice when switching.
      setKeep(
        mode === 'manage'
          ? {
              memberUserIds: fit.members.filter((member) => member.state === 'active').map((member) => member.userId),
              sourceIds: fit.channels.filter((channel) => channel.state === 'active').map((channel) => channel.id),
            }
          : defaultKeep(fit, currentUserId)
      );
    }
  }, [open, fit, mode, currentUserId]);

  if (!fit) return null;
  const problem = keepProblem(fit, keep);
  const { maxUsers, maxIntegrations } = fit.limits;
  const membersFull = keep.memberUserIds.length >= maxUsers;
  const channelsFull = keep.sourceIds.length >= maxIntegrations;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()} dismissOnOverlayClick={false} sheetOnPhone>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{mode === 'switch' ? 'Choose who stays active on Free' : "Choose who's active"}</DialogTitle>
          <DialogClose onClose={onCancel} />
        </DialogHeader>

        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            The Free plan has {maxUsers} seat{maxUsers === 1 ? '' : 's'} and {maxIntegrations} channel
            {maxIntegrations === 1 ? '' : 's'}. Everything you leave out is paused — never deleted. Paused members
            can&apos;t sign in to this workspace and paused channels stop receiving mail; upgrading brings them back.
          </p>

          <section aria-label="Members">
            <div className="flex justify-between items-baseline mb-2">
              <h3 className="text-sm font-semibold">Members</h3>
              <span className="text-xs text-muted-foreground">
                {keep.memberUserIds.length} of {maxUsers} seat{maxUsers === 1 ? '' : 's'}
              </span>
            </div>
            <ul className="space-y-2">
              {fit.members.map((member) => {
                const checked = keep.memberUserIds.includes(member.userId);
                return (
                  <li key={member.userId} className="flex gap-2 justify-between items-center">
                    <Checkbox
                      checked={checked}
                      disabled={busy === true || (!checked && membersFull)}
                      onChange={() => setKeep({ ...keep, memberUserIds: toggleId(keep.memberUserIds, member.userId) })}
                      label={
                        <span>
                          {member.name}
                          {member.email && member.email !== member.name ? (
                            <span className="ml-1 text-muted-foreground">{member.email}</span>
                          ) : null}
                        </span>
                      }
                    />
                    <span className="flex gap-1 shrink-0">
                      {member.role === 'org_admin' && <Badge variant="secondary">Admin</Badge>}
                      {member.state === 'paused' && <Badge variant="warning">Paused</Badge>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          {fit.channels.length > 0 && (
            <section aria-label="Channels">
              <div className="flex justify-between items-baseline mb-2">
                <h3 className="text-sm font-semibold">Channels</h3>
                <span className="text-xs text-muted-foreground">
                  {keep.sourceIds.length} of {maxIntegrations}
                </span>
              </div>
              <ul className="space-y-2">
                {fit.channels.map((channel) => {
                  const checked = keep.sourceIds.includes(channel.id);
                  return (
                    <li key={channel.id} className="flex gap-2 justify-between items-center">
                      <Checkbox
                        checked={checked}
                        disabled={busy === true || (!checked && channelsFull)}
                        onChange={() => setKeep({ ...keep, sourceIds: toggleId(keep.sourceIds, channel.id) })}
                        label={
                          <span>
                            {channel.name}
                            <span className="ml-1 text-muted-foreground">{channel.type}</span>
                          </span>
                        }
                      />
                      {channel.state === 'paused' && <Badge variant="warning">Paused</Badge>}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {problem && <Alert variant="warning">{problem}</Alert>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(keep)} disabled={!!problem} isLoading={busy}>
            {mode === 'switch' ? 'Switch to Free' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
