import type { MessageEvent } from '@/types';

/**
 * The time a thread item is ORDERED by. One function for the sort and for the day separators,
 * so a separator can only ever sit between days, in order — never "Today" above "Yesterday".
 *
 * ⚠️ Known divergence, not changed here: this prefers `sentAt` for inbound mail too, and an
 * inbound `sentAt` comes from the SENDER's Date header (which has been wrong in production),
 * while ThreadMessageItem DISPLAYS `receivedAt` for a customer message. A bubble can therefore
 * show a time from a different day than the separator above it when a sender's clock is off.
 */
export const threadTimeOf = (msg: MessageEvent): number =>
  new Date(
    msg.sentAt ?? (msg.metadata as { receivedAt?: string } | null)?.receivedAt ?? msg.createdAt
  ).getTime();

const localDayKey = (time: number): string => {
  const date = new Date(time);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

/** "Today" · "Yesterday" · "Tuesday 15 September" · "Tuesday 15 September 2025" — local time. */
export const dayLabel = (time: number, now: Date = new Date()): string => {
  const key = localDayKey(time);
  if (key === localDayKey(now.getTime())) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key === localDayKey(yesterday.getTime())) return 'Yesterday';
  const date = new Date(time);
  // Assembled from parts, not one toLocaleDateString: en-GB inserts a comma after the weekday
  // only when a year is present ("Wednesday, 31 December 2025"), so the label changed shape
  // depending on the year.
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'long' });
  const month = date.toLocaleDateString('en-GB', { month: 'long' });
  const year = date.getFullYear() === now.getFullYear() ? '' : ` ${date.getFullYear()}`;
  return `${weekday} ${date.getDate()} ${month}${year}`;
};

/**
 * Indices, in an already-sorted thread, where a new day begins — including the first item, so
 * the thread opens with the day it started on. An unparseable time never starts a day.
 */
export const dayStarts = (times: readonly number[]): Set<number> => {
  const starts = new Set<number>();
  let previous: string | null = null;
  times.forEach((time, index) => {
    if (Number.isNaN(time)) return;
    const key = localDayKey(time);
    if (key !== previous) starts.add(index);
    previous = key;
  });
  return starts;
};
