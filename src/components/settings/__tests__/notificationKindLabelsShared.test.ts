import { describe, it, expect } from 'vitest';
import {
  NOTIFICATION_KIND_LABELS,
  SLACK_KIND_LABELS,
  SLACK_KIND_WORDING,
} from '../notificationKindLabels';
import { kindsForChannel } from '@/services/slackNotifications.service';

describe('kind labels are defined once', () => {
  it('Slack uses the shared name for every kind it does not word differently', () => {
    for (const kind of Object.keys(NOTIFICATION_KIND_LABELS)) {
      if (kind in SLACK_KIND_WORDING) continue;
      expect(SLACK_KIND_LABELS[kind]).toBe(NOTIFICATION_KIND_LABELS[kind]);
    }
  });

  it('a Slack wording that only repeats the shared name is a copy that can drift', () => {
    for (const [kind, words] of Object.entries(SLACK_KIND_WORDING)) {
      expect(NOTIFICATION_KIND_LABELS[kind], kind).toBeDefined();
      expect(words, kind).not.toBe(NOTIFICATION_KIND_LABELS[kind]);
    }
  });

  it('every alert Slack offers has a name (never the raw key)', () => {
    for (const channel of ['team', 'admin'] as const) {
      for (const kind of kindsForChannel(channel)) {
        expect(SLACK_KIND_LABELS[kind], kind).toBeDefined();
      }
    }
  });
});
