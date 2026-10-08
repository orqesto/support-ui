/**
 * What the KB consolidation switches say to the person reading the cases page, "Run now" and the
 * quality tab — ONE place, so the three never disagree. Input is the backend's `switches`
 * (GET/POST `/consolidation/run`); without it (an older backend) every function answers null and
 * the caller keeps its own text.
 *
 * Owner, 2026-10-07: the old text ("ask the platform admin to turn it on") was false on a hosted
 * workspace with its own AI key, where the global switch it pointed at never reaches. The texts
 * still address the platform admin: workspace admins and moderators read them and cannot open the
 * console themselves (audit pass 1).
 */
import type { KbConsolidationSwitches, KbSwitch } from '@/services/kbConsolidation.service';

export const FLAG_ENABLED = 'kb.consolidation_enabled';
export const FLAG_DRY_RUN = 'kb.consolidation_dry_run';
export const FLAG_QUALITY = 'kb.quality_review_enabled';

/** The console's scope for this workspace — by name when known. */
const workspaceScope = (workspaceName?: string | null): string =>
  workspaceName ? `scope ${workspaceName}` : "this workspace's scope";

const ownKeyText = (flag: string, workspaceName?: string | null): string =>
  `This workspace uses its own AI key, so the global switch does not reach it. Ask the platform admin to turn ${flag} on for this workspace (Console → Feature flags → ${workspaceScope(workspaceName)}).`;

/** A workspace row that says off out-votes the global row: name the scope that must change. */
const whereToTurnOn = (decided: KbSwitch, workspaceName?: string | null): string =>
  decided.from === 'workspace'
    ? `Console → Feature flags → ${workspaceScope(workspaceName)}`
    : 'Console → Feature flags';

/** A flag the backend could not read is not "switched off": turning it on may change nothing. */
const unreadableText = (what: string, flag: string): string =>
  `${flag} could not be read, so ${what} does not run until it can.`;

const switchedOffText = (
  what: string,
  flag: string,
  decided: KbSwitch,
  switches: KbConsolidationSwitches,
  workspaceName?: string | null
): string =>
  decided.unreadable
    ? unreadableText(what.toLowerCase(), flag)
    : !switches.globalApplies
      ? ownKeyText(flag, workspaceName)
      : `${what} is switched off (${flag}). Ask the platform admin to turn it on (${whereToTurnOn(decided, workspaceName)}).`;

/** The trial's scope as the console names it; null when the code default decided (no row). */
const dryRunScope = (dryRun: KbSwitch, workspaceName?: string | null): string | null => {
  if (dryRun.from === 'workspace') return workspaceName ?? 'this workspace';
  if (dryRun.from === 'global') return 'global';
  return null;
};

/**
 * Why consolidation does not make real cases, or null when it does (or the backend did not say).
 * Order is the contract's: switched off (own key first), then a trial.
 */
export const consolidationSwitchText = (
  switches: KbConsolidationSwitches | null | undefined,
  workspaceName?: string | null
): string | null => {
  if (!switches) return null;
  if (!switches.enabled.on)
    return switchedOffText(
      'Consolidation',
      FLAG_ENABLED,
      switches.enabled,
      switches,
      workspaceName
    );
  if (switches.dryRun?.unreadable) return unreadableText('consolidation', FLAG_DRY_RUN);
  if (switches.dryRun?.on) {
    const scope = dryRunScope(switches.dryRun, workspaceName);
    return `Trial run: entries are labelled only — no cases are proposed, and the nightly quality review does not run. For real cases, ask the platform admin to turn ${FLAG_DRY_RUN} off${scope ? ` (Console → Feature flags → scope ${scope})` : ''}.`;
  }
  return null;
};

/**
 * Which switch keeps the nightly quality review off, or null when none does (or the backend did
 * not say). The review runs only with consolidation, so its switch is named first.
 */
export const qualitySwitchText = (
  switches: KbConsolidationSwitches | null | undefined,
  workspaceName?: string | null
): string | null => {
  if (!switches) return null;
  // The review runs only in a production run: consolidation off, or a dry run that could not be
  // read (the run then skips), keeps it off too — name THAT switch.
  if (!switches.enabled.on || switches.dryRun?.unreadable)
    return `The nightly quality review runs only with consolidation. ${consolidationSwitchText(switches, workspaceName)}`;
  if (switches.quality && !switches.quality.on)
    return switchedOffText(
      'The nightly quality review',
      FLAG_QUALITY,
      switches.quality,
      switches,
      workspaceName
    );
  return null;
};
