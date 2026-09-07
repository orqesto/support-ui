/**
 * The Free-on-managed retention deadline, phrased ONE way (BYODB §3.4). The banner and the
 * Database card both show it; a single helper keeps the day count, the colour threshold and
 * the sentence from drifting apart (they did: one clamped to 0 days, the other said "passed").
 */
export type RetentionNotice = {
  deadline: Date;
  daysLeft: number;
  /** Red inside the last week or once the date has passed; amber before. */
  tone: 'warning' | 'danger';
  sentence: string;
};

export const retentionNotice = (sharedRetentionUntil: string | null | undefined, now = Date.now()): RetentionNotice | null => {
  if (!sharedRetentionUntil) return null;
  const deadline = new Date(sharedRetentionUntil);
  if (Number.isNaN(deadline.getTime())) return null;
  const daysLeft = Math.ceil((deadline.getTime() - now) / 86_400_000);
  const when =
    daysLeft <= 0 ? 'The deadline has passed' : daysLeft === 1 ? 'You have 1 day left' : `You have ${daysLeft} days left`;
  return {
    deadline,
    daysLeft,
    tone: daysLeft <= 7 ? 'danger' : 'warning',
    sentence: `Free runs on your own Postgres. Connect yours before ${deadline.toLocaleDateString()} or this workspace's data will be deleted from the managed database. ${when}. Upgrading to a paid plan also clears the deadline.`,
  };
};
