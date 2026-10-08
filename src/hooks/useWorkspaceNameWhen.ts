import { useEffect, useState } from 'react';
import { organizationService } from '@/services/organization.service';

/**
 * The current workspace's name, read only once `needed` turns true (a switch text that names the
 * workspace is about to show). A plain read, not a react-query hook: the KB pages render under
 * tests without a QueryClientProvider. A failed read leaves it undefined — the text then says
 * "this workspace" rather than guessing.
 */
export const useWorkspaceNameWhen = (needed: boolean): string | undefined => {
  const [name, setName] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!needed || name !== undefined) return;
    let live = true;
    organizationService
      .getCurrent()
      .then((org) => {
        if (live && typeof org?.name === 'string' && org.name) setName(org.name);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [needed, name]);
  return name;
};
