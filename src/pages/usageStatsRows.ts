/** `/api/subscriptions/usage` as the Usage Stats page reads it. */
export type RawUsage = {
  aiCalls: {
    current: number;
    limit: number;
    overage: number;
    percentage: number;
    /** false ⇒ own AI key: the allowance is the platform key's and does not apply. Absent on older backends. */
    appliesToThisWorkspace?: boolean;
  };
  /** `limit` includes message packs bought into this period (the cap the check enforces). */
  messages: { current: number; limit: number; percentage: number };
};

export type UsageRow = {
  moduleName: string;
  displayName: string;
  current: number;
  included: number;
  overage: number;
  overagePrice: number;
  estimatedOverageCost: number;
  unitName: string;
};

/**
 * Rows for the Usage Stats table. Own AI key: the call allowance belongs to the platform key, so
 * there is nothing to measure those calls against — no "included", no "overage" (Free, own key
 * required, showed every call as overage). An older backend omits the flag: the old reading stays.
 */
export const usageRowsFrom = (raw: RawUsage | undefined): UsageRow[] => {
  const ownKey = raw?.aiCalls?.appliesToThisWorkspace === false;
  const aiCurrent = raw?.aiCalls?.current ?? 0;
  const aiLimit = ownKey ? 0 : (raw?.aiCalls?.limit ?? 0);
  const msgCurrent = raw?.messages?.current ?? 0;
  const msgLimit = raw?.messages?.limit ?? 0;
  return [
    {
      moduleName: 'ai-calls',
      displayName: ownKey ? 'AI Calls (your own AI key — no plan allowance)' : 'AI Calls',
      current: aiCurrent,
      included: aiLimit,
      overage: ownKey ? 0 : (raw?.aiCalls?.overage ?? Math.max(0, aiCurrent - aiLimit)),
      overagePrice: 0,
      estimatedOverageCost: 0,
      unitName: 'call',
    },
    {
      moduleName: 'messages',
      displayName: 'Messages',
      current: msgCurrent,
      included: msgLimit,
      overage: Math.max(0, msgCurrent - msgLimit),
      overagePrice: 0,
      estimatedOverageCost: 0,
      unitName: 'message',
    },
  ];
};
