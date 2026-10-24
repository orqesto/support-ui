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
 * Rows for the Usage Stats table. Before the money budgets are applied (`budgetsActive` false: the
 * server answers `ai.active === false`, or sends no `ai` block) the old monthly AI-call cap still
 * refuses work, so the row keeps its limit and overage. Once applied, AI calls are a statistic
 * only: no included, no overage, no percentage. Own AI key: the call allowance belongs to the
 * platform key, so there is nothing to measure those calls against in either state.
 *
 * `aiIncluded` is the Subscription page's AI-source rule (`aiSourceFrom(...) === 'included'`): the
 * messages row says "AI included" only then — never on Free, own key, no AI or an unknown plan.
 */
export const usageRowsFrom = (
  raw: RawUsage | undefined,
  budgetsActive = false,
  aiIncluded = false
): UsageRow[] => {
  const ownKey = raw?.aiCalls?.appliesToThisWorkspace === false;
  const aiCurrent = raw?.aiCalls?.current ?? 0;
  const capApplies = !budgetsActive && !ownKey;
  const aiLimit = capApplies ? (raw?.aiCalls?.limit ?? 0) : 0;
  const msgCurrent = raw?.messages?.current ?? 0;
  const msgLimit = raw?.messages?.limit ?? 0;
  let aiName = 'AI Calls';
  if (budgetsActive) {
    aiName = ownKey ? 'AI calls (your own AI key; a count, no limit)' : 'AI calls (a count, no limit)';
  } else if (ownKey) {
    aiName = 'AI Calls (your own AI key — no plan allowance)';
  }
  return [
    {
      moduleName: 'ai-calls',
      displayName: aiName,
      current: aiCurrent,
      included: aiLimit,
      overage: capApplies
        ? (raw?.aiCalls?.overage ?? Math.max(0, aiCurrent - aiLimit))
        : 0,
      overagePrice: 0,
      estimatedOverageCost: 0,
      unitName: 'call',
    },
    {
      moduleName: 'messages',
      displayName: aiIncluded ? 'Messages (AI included)' : 'Messages',
      current: msgCurrent,
      included: msgLimit,
      overage: Math.max(0, msgCurrent - msgLimit),
      overagePrice: 0,
      estimatedOverageCost: 0,
      unitName: 'message',
    },
  ];
};
