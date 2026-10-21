/** `/api/subscriptions/usage` as the Usage Stats page reads it. */
export type RawUsage = {
  aiCalls: {
    current: number;
    /** Ignored: AI calls have no limit any more. Older backends still send these. */
    limit?: number;
    overage?: number;
    percentage?: number;
    /** false ⇒ own AI key (named in the label). Absent on older backends. */
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
 * Rows for the Usage Stats table. AI calls are a statistic only (money-budget build): the AI
 * allowance is money, shown as messages, so the row has no "included", no overage and no
 * percentage whatever the workspace runs on. An own AI key is named in the label. The messages
 * row carries the limit (packs included).
 */
export const usageRowsFrom = (raw: RawUsage | undefined): UsageRow[] => {
  const ownKey = raw?.aiCalls?.appliesToThisWorkspace === false;
  const aiCurrent = raw?.aiCalls?.current ?? 0;
  const msgCurrent = raw?.messages?.current ?? 0;
  const msgLimit = raw?.messages?.limit ?? 0;
  return [
    {
      moduleName: 'ai-calls',
      displayName: ownKey ? 'AI calls (your own AI key; a count, no limit)' : 'AI calls (a count, no limit)',
      current: aiCurrent,
      included: 0,
      overage: 0,
      overagePrice: 0,
      estimatedOverageCost: 0,
      unitName: 'call',
    },
    {
      moduleName: 'messages',
      displayName: 'Messages (AI included)',
      current: msgCurrent,
      included: msgLimit,
      overage: Math.max(0, msgCurrent - msgLimit),
      overagePrice: 0,
      estimatedOverageCost: 0,
      unitName: 'message',
    },
  ];
};
