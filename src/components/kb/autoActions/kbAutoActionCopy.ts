/** Plain-language copy for the Automatic actions page. No raw keys on screen. */
import type {
  KbAutoActionKey,
  KbAutoGate,
  KbAutoGateRefusal,
} from '@/services/kbAutoActions.service';

export const ACTION_LABELS: Record<KbAutoActionKey, string> = {
  remove: 'Remove entries the review is sure are wrong',
  approveMined: 'Approve answers learned from the mailbox',
  hold: 'Set aside answers about one customer',
  cleanPersonalData: 'Remove personal details from answers',
};

/** Actions that always wait for a person: shown so the page lists every kind of change. */
export const WAITING_LABELS = ['Merge into a case', 'Rewrite an answer', 'Approve saved answers'];

/** The agreement the gate asks for, as a percentage (mirrors the backend's MIN_AGREEMENT). */
const GATE_AGREEMENT_PERCENT = 90;

/** What stops Automatic: how many more to rate, or that people disagreed too often. */
export const gateLine = (
  gate: Pick<KbAutoGate, 'needRated' | 'rate' | 'reason'> | KbAutoGateRefusal
): string => {
  if (gate.needRated > 0) return `Rate ${gate.needRated} more to switch this on.`;
  if (gate.reason === 'low_agreement') {
    const seen = gate.rate === null ? '' : ` (${Math.round(gate.rate * 100)}% so far)`;
    return `People agreed with this too rarely${seen}; it needs ${GATE_AGREEMENT_PERCENT}% to switch on.`;
  }
  return 'Rate more to switch this on.';
};

const SWITCH_ON: Record<string, string> = {
  'kb.consolidation_enabled': 'knowledge base consolidation',
  'kb.quality_review_enabled': 'the nightly quality review',
};
const TEST_MODE = 'kb.consolidation_dry_run';

/** The notice for an action the feature flags stop, or null when nothing does. */
export const blockedByLine = (blockedBy: string[]): string | null => {
  if (blockedBy.length === 0) return null;
  const on = blockedBy
    .filter((flag) => flag !== TEST_MODE)
    .map((flag) => SWITCH_ON[flag] ?? 'a required setting');
  const parts = [
    on.length > 0 ? `switch on ${[...new Set(on)].join(' and ')}` : null,
    blockedBy.includes(TEST_MODE) ? 'switch off test mode' : null,
  ].filter((part): part is string => part !== null);
  return `Not checked for this workspace — ${parts.join(' and ')} in Platform console › Feature flags.`;
};
