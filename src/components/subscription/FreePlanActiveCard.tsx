import { useCallback, useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { toast } from '@/lib/toast';
import { subscriptionService, type KeepChoice, type PlanFit } from '@/services/subscription.service';
import { KeepActiveDialog } from './KeepActiveDialog';
import { isOverPlan } from './keepActive';

type FreePlanActiveCardProps = {
  planName: string;
  canManage: boolean;
  currentUserId?: number | null;
};

/**
 * Task #8 — on the Free plan with pausing on, who is paused and a way to change who is active.
 * Renders nothing anywhere else: on another plan, for someone who cannot manage billing, when the
 * backend does not offer `/plan-fit` yet, or when nothing is paused and the workspace fits.
 */
export const FreePlanActiveCard = ({ planName, canManage, currentUserId }: FreePlanActiveCardProps) => {
  const [fit, setFit] = useState<PlanFit | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (planName !== 'free' || !canManage) {
      setFit(null);
      return;
    }
    setFit(await subscriptionService.getPlanFit().catch(() => null));
  }, [planName, canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!fit?.enforced) return null;
  const pausedMembers = fit.members.filter((member) => member.state === 'paused').length;
  const pausedChannels = fit.channels.filter((channel) => channel.state === 'paused').length;
  if (pausedMembers + pausedChannels === 0 && !isOverPlan(fit)) return null;

  const save = async (keep: KeepChoice) => {
    setSaving(true);
    try {
      await subscriptionService.setActiveWithinPlan(keep);
      toast.success("Saved — who's active has been updated.");
      setChoosing(false);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error) ?? 'Could not save who is active.');
    } finally {
      setSaving(false);
    }
  };

  const paused = [
    pausedMembers > 0 ? `${pausedMembers} member${pausedMembers === 1 ? '' : 's'}` : '',
    pausedChannels > 0 ? `${pausedChannels} channel${pausedChannels === 1 ? '' : 's'}` : '',
  ]
    .filter(Boolean)
    .join(' and ');

  return (
    <Card>
      <CardContent className="flex flex-wrap gap-3 justify-between items-center p-4">
        <div className="flex gap-3 items-start">
          <Users className="mt-0.5 w-5 h-5 text-muted-foreground" />
          <div>
            <p className="font-medium">Who&apos;s active on the Free plan</p>
            <p className="text-sm text-muted-foreground">
              {paused ? `${paused} paused to fit Free — nothing was deleted. ` : ''}
              Choose who and what stays active, or upgrade to bring everything back.
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => setChoosing(true)}>
          Choose who&apos;s active
        </Button>
      </CardContent>
      <KeepActiveDialog
        open={choosing}
        fit={fit}
        currentUserId={currentUserId}
        mode="manage"
        busy={saving}
        onConfirm={(keep) => void save(keep)}
        onCancel={() => setChoosing(false)}
      />
    </Card>
  );
};
