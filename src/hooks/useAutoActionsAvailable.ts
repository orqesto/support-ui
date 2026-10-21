/**
 * Checks that the Automatic actions route EXISTS on this deployment's backend (the page itself
 * falls back to the remove-only view on an older one). The FE reaches production on
 * merge, the backend on a tag, so the sidebar link must not lead to a page that cannot work.
 * Answers true only once the overview route has answered; a 404 from an absent route, an error,
 * or no answer yet all read as "not available" (the link simply is not drawn).
 *
 * Asked at most once per session and only when `enabled` (the person may manage the knowledge
 * base): the Layout mounts on every page, and the overview is not a cheap request.
 */
import { useEffect, useState } from 'react';
import { isRouteAbsent } from '@/lib/apiError';
import { kbAutoActionsService } from '@/services/kbAutoActions.service';

let answer: Promise<boolean> | null = null;

export const resetAutoActionsAvailability = (): void => {
  answer = null;
};

const ask = (): Promise<boolean> => {
  answer ??= kbAutoActionsService.getOverview().then(
    () => true,
    (error: unknown) => {
      // Only an absent route is a verdict on the deployment; any other failure asks again later.
      if (!isRouteAbsent(error)) answer = null;
      return false;
    }
  );
  return answer;
};

export const useAutoActionsAvailable = (enabled: boolean): boolean => {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    void ask().then((result) => {
      if (live) setAvailable(result);
    });
    return () => {
      live = false;
    };
  }, [enabled]);
  return enabled && available;
};
