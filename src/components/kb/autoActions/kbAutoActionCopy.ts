/** Plain-language copy for the Automatic actions page. No raw keys on screen. */
import type {
  KbAutoActionKey,
  KbCapturedVia,
  KbAutoGate,
  KbAutoGateRefusal,
} from '@/services/kbAutoActions.service';

export const ACTION_LABELS: Record<KbAutoActionKey, string> = {
  remove: 'Remove entries the review is sure are wrong',
  approveMined: 'Make answers learned from the mailbox live',
  hold: 'Set aside answers about one customer',
  cleanPersonalData: 'Remove personal details from answers',
  approveCaptures: 'Make answers people saved live',
};

/** Where Automatic actions lives: a section of Settings › AI (it left the sidebar 2026-10-22). */
export const AUTO_ACTIONS_HREF = '/settings#ai/automatic-actions';

/**
 * Kinds of change that always wait for a person: shown so the page lists every kind of change.
 * A row with `replacedBy` gives way to that action's real row once the backend sends it.
 */
export const WAITING_ROWS: { label: string; replacedBy?: KbAutoActionKey }[] = [
  { label: 'Merge into a case' },
  { label: 'Rewrite an answer' },
  { label: 'Approve saved answers', replacedBy: 'approveCaptures' },
];

/** How a person saved an answer, for the approveCaptures sample. */
export const savedByLine = (
  capturedVia: KbCapturedVia | null,
  name: string | null
): string | null => {
  if (capturedVia === 'resolve') return name ? `Saved by ${name} on Resolve` : 'Saved on Resolve';
  if (capturedVia === 'manual_promote') return name ? `Saved to KB by ${name}` : 'Saved to KB';
  return null;
};

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

/**
 * approveCaptures: answers saved earlier are checked by the nightly run, which these flags stop.
 * New answers are still checked when they are saved, so this is a notice, not a block.
 */
export const backlogBlockedLine = (backlogBlockedBy: string[] | undefined): string | null => {
  if (!backlogBlockedBy || backlogBlockedBy.length === 0) return null;
  const on = [
    ...new Set(
      backlogBlockedBy
        .filter((flag) => flag !== TEST_MODE)
        .map((flag) => SWITCH_ON[flag] ?? 'a required setting')
    ),
  ];
  const parts = [
    on.length > 0 ? `${on.join(' and ')} ${on.length === 1 ? 'is' : 'are'} on` : null,
    backlogBlockedBy.includes(TEST_MODE) ? 'test mode is off' : null,
  ].filter((part): part is string => part !== null);
  return `Answers saved earlier are checked only when ${parts.join(' and ')}.`;
};
