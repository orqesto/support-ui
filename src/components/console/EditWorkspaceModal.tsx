import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Toggle } from '@/components/ui/Toggle';
import { usePlatformPlans } from '@/hooks/usePlatformAdmin';
import { organizationService, type Organization } from '@/services/organization.service';

type Props = {
  org: Organization | null;
  isOpen: boolean;
  onClose: () => void;
  /** Refetch the workspace list after a successful save. */
  onSaved: () => void | Promise<void>;
};

/**
 * Platform console → Organizations → edit one workspace. Replaces the former cramped
 * inline edit-in-row form: name / description / active plus a Plan selector (global-admin).
 * Save PATCHes the workspace core fields and, when the plan changed, switches the plan in a
 * second call. The plan list comes from the admin plan catalog; the org row only carries the
 * plan's slug/displayName (no id), so the current selection is resolved by matching slug.
 */
export const EditWorkspaceModal = ({ org, isOpen, onClose, onSaved }: Props) => {
  const plansQuery = usePlatformPlans();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [planId, setPlanId] = useState<string>('');
  const [initialPlanId, setInitialPlanId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Assignable plans: active ones, plus the workspace's current plan even if it's been
  // retired (so the current selection is always representable).
  const planOptions = useMemo(() => {
    const plans = plansQuery.data ?? [];
    const currentSlug = org?.plan?.name;
    return plans.filter((plan) => plan.isActive || plan.name === currentSlug);
  }, [plansQuery.data, org?.plan?.name]);

  useEffect(() => {
    if (!org) {
      return;
    }
    setName(org.name);
    setDescription(org.description ?? '');
    setActive(org.active);
    const current = (plansQuery.data ?? []).find((plan) => plan.name === org.plan?.name);
    const currentId = current ? String(current.id) : '';
    setPlanId(currentId);
    setInitialPlanId(currentId);
  }, [org, plansQuery.data]);

  if (!org) {
    return null;
  }

  const planChanged = planId !== initialPlanId && planId !== '';

  const handleSave = async () => {
    setSaving(true);
    try {
      await organizationService.updateById(org.id, {
        name: name.trim(),
        description: description.trim() || null,
        active,
      });
      if (planChanged) {
        await organizationService.switchWorkspacePlan(org.id, Number(planId));
      }
      toast.success('Workspace updated');
      await onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update workspace');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogHeader>
        <DialogTitle>Edit workspace — {org.name}</DialogTitle>
        <DialogClose onClose={onClose} />
      </DialogHeader>
      <DialogContent>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ws-name">Name</Label>
            <Input
              id="ws-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ws-description">Description</Label>
            <Textarea
              id="ws-description"
              value={description}
              rows={3}
              placeholder="Brief description of the workspace"
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ws-plan">Plan</Label>
            <Select
              id="ws-plan"
              value={planId}
              disabled={plansQuery.isLoading}
              aria-label={`Plan for ${org.name}`}
              onChange={(event) => setPlanId(event.target.value)}
            >
              <option value="">No plan</option>
              {planOptions.map((plan) => (
                <option key={plan.id} value={String(plan.id)}>
                  {plan.displayName}
                </option>
              ))}
            </Select>
            {plansQuery.isError && (
              <p className="text-xs text-destructive">Couldn&apos;t load plans.</p>
            )}
          </div>

          <div className="flex justify-between items-center pt-1">
            <Label>Active</Label>
            <Toggle checked={active} onChange={setActive} label={active ? 'Active' : 'Inactive'} />
          </div>
        </div>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={() => void handleSave()}
          isLoading={saving}
          disabled={!name.trim() || saving}
        >
          Save changes
        </Button>
      </DialogFooter>
    </Dialog>
  );
};
