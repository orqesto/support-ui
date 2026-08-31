import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { getSocket, releaseSocket, subscribeToEvent, unsubscribeFromEvent } from '@/lib/socketManager';
import { useAuthStore } from '@/stores/authStore';
import type { Notification } from '@/types/api';

/**
 * "Your AI provider has stopped answering" — the one notification kind whose whole point
 * is that nothing else on screen would have told you.
 *
 * Prod, 2026-08-30: OpenAI returned `429 no credits remaining` for twenty hours. Analysis
 * did not stop — it fell back to local embedding analysis on every message — so mail kept
 * being classified, on a weaker signal, with every health surface reporting green. The
 * symptom of this outage is answers quietly getting worse, which is why it needs to be
 * said rather than inferred.
 *
 * ⛔ Only ever raised for a workspace's OWN key. A failure on the platform's shared
 * credential is not something a customer can act on, so the backend deliberately does not
 * publish one — see aiProviderFailureReporter.
 */
export const AI_PROVIDER_DOWN_KIND = 'ai_provider_down';

export type AiProviderAlert = {
  id: number;
  provider: string;
  /** Already trimmed and credential-free by the backend. */
  reason: string;
  /** ISO timestamp of the first failure in this outage. */
  since: string;
  /** What analysis silently degraded to while the provider is down. */
  degradedTo: string | null;
  message: string;
};

type AlertDetails = {
  provider?: string;
  reason?: string;
  since?: string;
  message?: string;
  degradedTo?: string;
};

const toAlert = (row: Notification): AiProviderAlert => {
  const details = (row.details ?? {}) as AlertDetails;
  return {
    id: row.id,
    provider: details.provider ?? 'AI provider',
    reason: details.reason ?? '',
    since: details.since ?? row.createdAt,
    degradedTo: details.degradedTo ?? null,
    message: details.message ?? 'Live calls to the AI provider are failing.',
  };
};

export type UseAiProviderAlertsResult = ReturnType<typeof useAiProviderAlerts>;

export const useAiProviderAlerts = () => {
  const [alerts, setAlerts] = useState<AiProviderAlert[]>([]);
  const orgKey = useAuthStore(
    (state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null
  );

  const fetchAlerts = useCallback(() => {
    apiClient
      .get('/api/notifications')
      .then((res) => {
        const payload = (
          res.data as { data: { notifications: Notification[]; total: number } }
        ).data;
        setAlerts(
          payload.notifications
            .filter((row) => (row as { kind?: string }).kind === AI_PROVIDER_DOWN_KIND)
            .map(toAlert)
        );
      })
      // A failed poll must not clear a standing alert: an empty list here would read as
      // "the provider recovered", which is the opposite of what a fetch error means.
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts, orgKey]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onNew = () => fetchAlerts();
    subscribeToEvent('notification:new', onNew);
    return () => {
      unsubscribeFromEvent('notification:new', onNew);
      releaseSocket();
    };
  }, [fetchAlerts]);

  /** Dismiss the row. The backend re-raises it if the provider is still failing. */
  const dismiss = useCallback((id: number) => {
    setAlerts((current) => current.filter((alert) => alert.id !== id));
    apiClient.patch(`/api/notifications/${id}/dismiss`).catch(() => {});
  }, []);

  return { alerts, dismiss, refresh: fetchAlerts };
};
