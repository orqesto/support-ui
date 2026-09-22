/**
 * Moving to six colour roles collapsed statuses that used to differ by hue — Open and In
 * Progress both became muted grey, Pending and On-hold both amber, and Needs Routing matched
 * them. A label still names each chip, but the list is scanned by colour, so two statuses
 * that share one look read as one. Each must stay distinguishable at a glance.
 */
import { describe, it, expect } from 'vitest';
import { WORKFLOW_STATUS_META, getRoutingBadge } from '../inboxCardHelpers';

const norm = (cls: string) => cls.split(/\s+/).filter(Boolean).sort().join(' ');

describe('status chips — distinct at a glance', () => {
  it('gives every workflow status its own look', () => {
    const looks = Object.values(WORKFLOW_STATUS_META).map((meta) => norm(meta.className));
    expect(new Set(looks).size).toBe(looks.length);
  });

  it('does not paint Needs Routing like any workflow status', () => {
    const routing = getRoutingBadge({ status: 'needs_routing' });
    expect(routing).not.toBeNull();
    const looks = Object.values(WORKFLOW_STATUS_META).map((meta) => norm(meta.className));
    expect(looks).not.toContain(norm(routing?.className ?? ''));
  });
});
