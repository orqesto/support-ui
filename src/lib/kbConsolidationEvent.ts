/**
 * A KB merge proposal was decided in THIS tab. The bell's merge row counts pending proposals; the
 * server re-counts and says so on the socket, but a tab whose socket is down would keep the old
 * number — so the decision is also announced locally and the bell re-reads its row.
 *
 * App-wide, not in the KB feature: the KB screens announce it and the notification bell
 * (`hooks/useKbReviewAlerts`) listens.
 */
export const KB_CONSOLIDATION_DECIDED_EVENT = 'kb-consolidation:decided';

export const announceKbConsolidationDecided = (): void => {
  window.dispatchEvent(new Event(KB_CONSOLIDATION_DECIDED_EVENT));
};
