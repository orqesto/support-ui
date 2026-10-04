import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { kbQualityService, type KbQualityStatus } from '@/services/kbQuality.service';

/** A review that has checked nothing for this long while entries still wait has likely stopped. */
export const QUALITY_STALL_DAYS = 3;
const DAY_MS = 86_400_000;

const formatDate = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
};

/**
 * What the suggestions below do NOT say: how much of the KB the nightly review has checked, and
 * whether it is running at all. "No suggestions" on a KB that is 2% checked is not "clean", and a
 * review that stopped (no AI provider, a budget, a broken model) produces no suggestions either.
 */
export const describeQualityStatus = (
  status: KbQualityStatus,
  now: number = Date.now()
): { variant: 'default' | 'warning'; text: string } => {
  const { coverage } = status;
  if (status.state === 'off') {
    return { variant: 'default', text: 'The nightly quality review is off for this workspace — nothing new will be suggested.' };
  }
  if (status.state === 'dry_run') {
    return {
      variant: 'default',
      text: 'A knowledge base cases calibration is running for this workspace; the quality review does not run until it ends.',
    };
  }
  if (status.state === 'no_provider') {
    return {
      variant: 'warning',
      text: 'The quality review is on but skipped every night: this workspace has no usable AI provider.',
    };
  }
  if (coverage.entries === 0) return { variant: 'default', text: 'There are no learned entries to check yet.' };
  const percent = Math.floor((coverage.checked / coverage.entries) * 100);
  const parts = [`Checked ${coverage.checked.toLocaleString('en')} of ${coverage.entries.toLocaleString('en')} learned entries (${percent}%).`];
  if (coverage.notYet > 0) {
    parts.push(`${coverage.notYet.toLocaleString('en')} not checked yet — a few hundred are checked each night, the most used first.`);
  }
  if (coverage.unassessed > 0) {
    parts.push(`${coverage.unassessed.toLocaleString('en')} could not be assessed by the AI and are skipped until edited.`);
  }
  if (coverage.rewritesWaiting > 0) {
    parts.push(`${coverage.rewritesWaiting.toLocaleString('en')} rewrites are still to be written.`);
  }
  const stalled =
    coverage.notYet > 0 &&
    (coverage.lastCheckedAt === null || now - new Date(coverage.lastCheckedAt).getTime() > QUALITY_STALL_DAYS * DAY_MS);
  if (stalled) {
    parts.push(
      coverage.lastCheckedAt === null
        ? 'Nothing has been checked yet — if this stays so after a night, the review is not running (check the AI provider and its budget).'
        : `Nothing has been checked since ${formatDate(coverage.lastCheckedAt)} — the review may be failing (check the AI provider and its budget).`
    );
  } else if (coverage.lastCheckedAt) {
    parts.push(`Last checked ${formatDate(coverage.lastCheckedAt)}.`);
  }
  return { variant: stalled ? 'warning' : 'default', text: parts.join(' ') };
};

/** The Quality tab's status line. Renders nothing against a backend that does not serve it. */
export const KbQualityCoverage = ({ reloadKey }: { reloadKey?: unknown }) => {
  const [status, setStatus] = useState<KbQualityStatus | null>(null);
  useEffect(() => {
    let live = true;
    void kbQualityService.getStatus().then((next) => {
      if (live) setStatus(next);
    });
    return () => {
      live = false;
    };
  }, [reloadKey]);
  if (!status) return null;
  const { variant, text } = describeQualityStatus(status);
  return (
    <div data-testid="kb-quality-coverage">
      <Alert variant={variant}>{text}</Alert>
    </div>
  );
};
