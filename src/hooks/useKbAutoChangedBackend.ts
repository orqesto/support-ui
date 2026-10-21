import { useEffect, useState } from 'react';
import { kbService } from '@/services/kb.service';
import { useAuthStore } from '@/stores/authStore';

/**
 * Does this deployment's backend know "Changed automatically" (`filters.autoChangedStatus`)? For
 * views outside the Knowledge Base list (the cases view) that keep their own undo buttons until it
 * does. null: not answered yet (or the probe failed) — read as "not confirmed". The FE reaches
 * production on merge, the backend on a tag. One probe per workspace per session, only on a
 * successful answer.
 */
const answers = new Map<number | null, boolean>();

export const resetKbAutoChangedBackend = (): void => answers.clear();

export const useKbAutoChangedBackend = (): boolean | null => {
  const organizationId = useAuthStore((state) => state.selectedOrganizationId) ?? null;
  const [supported, setSupported] = useState<boolean | null>(answers.get(organizationId) ?? null);
  useEffect(() => {
    const known = answers.get(organizationId);
    if (known !== undefined) {
      setSupported(known);
      return undefined;
    }
    setSupported(null);
    let live = true;
    kbService.getAll({ status: 'auto_changed', limit: 1 }).then(
      (body) => {
        const yes = body?.data?.filters?.autoChangedStatus === true;
        answers.set(organizationId, yes);
        if (live) setSupported(yes);
      },
      () => {
        // Not a verdict: stays unconfirmed (buttons kept) and is asked again next time.
      }
    );
    return () => {
      live = false;
    };
  }, [organizationId]);
  return supported;
};
