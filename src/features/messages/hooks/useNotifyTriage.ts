import { useEffect, useRef, useState } from 'react';
import type { useNotificationCounts } from '@/hooks/useNotificationCounts';
import { toast } from '@/lib/toast';
import { NOTIFY_TRIAGE_KEY } from '../components/messagesPage/messagesPageConstants';

export const useNotifyTriage = (
  arrivalCounts: ReturnType<typeof useNotificationCounts>['counts']
) => {
  // "Notify me about new triage mail" (⋯ menu): a per-device choice, off by default. In-app only.
  const [notifyTriage, setNotifyTriage] = useState(() => {
    try {
      return localStorage.getItem(NOTIFY_TRIAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const spamArrivals = arrivalCounts.spam_arrival ?? 0;
  const seenSpamArrivals = useRef(spamArrivals);
  useEffect(() => {
    if (notifyTriage && spamArrivals > seenSpamArrivals.current) {
      toast.info('New in Spam — check it from Triage');
    }
    seenSpamArrivals.current = spamArrivals;
  }, [spamArrivals, notifyTriage]);
  return { notifyTriage, setNotifyTriage, spamArrivals };
};
