import { describe, it, expect } from 'vitest';
import { classifyBreach } from './slaBreachDisposition';

describe('classifyBreach', () => {
  it('treats a never-seen id as new', () => {
    expect(classifyBreach(undefined, 'warning')).toBe('new');
    expect(classifyBreach(undefined, 'critical')).toBe('new');
  });

  it('treats warning → critical as an escalation (the dropped-notification bug)', () => {
    expect(classifyBreach('warning', 'critical')).toBe('escalation');
  });

  it('treats same-severity re-broadcasts as duplicates', () => {
    expect(classifyBreach('warning', 'warning')).toBe('duplicate');
    expect(classifyBreach('critical', 'critical')).toBe('duplicate');
  });

  it('treats a critical → warning de-escalation as a duplicate (no re-surface)', () => {
    expect(classifyBreach('critical', 'warning')).toBe('duplicate');
  });
});
