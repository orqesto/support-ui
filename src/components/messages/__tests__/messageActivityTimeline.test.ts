import { describe, it, expect } from 'vitest';
import { auditEntryLabel, buildTimeline } from '../messageActivityTimeline';
import type { MessageActivityEntry } from '@/services/message.service';

const entry = (
  action: string,
  details: Record<string, unknown> | null,
  createdAt = '2026-08-20T10:00:00.000Z'
): MessageActivityEntry =>
  ({ id: 1, action, details, createdAt, userEmail: 'agent@example.com', userId: 7 }) as MessageActivityEntry;

describe('messageActivityTimeline — read/unread entries', () => {
  // Read state is shared across the org, so "who marked this read" is team-visible
  // history rather than a private toggle — it has to render as words, not as the
  // raw audit action string.
  it('labels a read change in both directions', () => {
    expect(auditEntryLabel('message.read_change', { isRead: true })).toBe('Marked as read');
    expect(auditEntryLabel('message.read_change', { isRead: false })).toBe('Marked as unread');
  });

  it('does not fall through to the raw action name', () => {
    expect(auditEntryLabel('message.read_change', { isRead: true })).not.toBe('message.read_change');
    expect(auditEntryLabel('message.read_change', null)).toBe('Marked as unread');
  });

  it('carries the acting agent into the timeline', () => {
    const [item] = buildTimeline([entry('message.read_change', { isRead: true })], [], []);
    expect(item.label).toBe('Marked as read');
    expect(item.who).toBe('agent@example.com');
  });

  it('still renders unmapped actions verbatim', () => {
    expect(auditEntryLabel('message.something_new', null)).toBe('message.something_new');
  });
});
