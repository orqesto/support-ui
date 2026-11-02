import { useEffect, useState } from 'react';
import { organizationService } from '@/services/organization.service';

/**
 * The values colleagues hold per routing key, for one-click picking. Best-effort: an older backend
 * (null) or a user without settings access (error) simply gets no suggestions.
 */
export const useExistingSkillValues = (keys: string[]): Record<string, string[]> => {
  const [existing, setExisting] = useState<Record<string, string[]>>({});
  const signature = keys.join('\u0000');
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      keys.map(async (key) => {
        const rows = await organizationService.getRoutingKeyValues(key).catch(() => null);
        return [key, (rows ?? []).map((row) => row.value)] as const;
      })
    ).then((entries) => {
      if (!cancelled) setExisting(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  return existing;
};
