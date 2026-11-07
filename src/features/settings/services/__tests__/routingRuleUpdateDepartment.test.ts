/**
 * FE audit 2026-09-29, B-H1: the edit dialog offered a department and said "moves this rule to
 * another team", but `UpdateRoutingRuleInput` omitted `departmentId`, so the settings page could
 * not send it and the move never happened. The backend's PATCH accepts and applies it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const patch = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: { patch, get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const { routingRuleService } = await import('../routingRule.service');

describe('routingRuleService.update', () => {
  beforeEach(() => {
    patch.mockReset().mockResolvedValue({ data: { success: true, data: { id: 5 } } });
  });

  it('carries the department, so an edit can move the rule', async () => {
    // Compiles only because the type now allows it (the audit's defect was the type).
    await routingRuleService.update(5, { value: 'invoice', departmentId: 3 });
    expect(patch).toHaveBeenCalledWith('/api/routing-rules/5', {
      value: 'invoice',
      departmentId: 3,
    });
  });

  it('CONTROL: an edit without a department sends none', async () => {
    await routingRuleService.update(5, { value: 'invoice' });
    expect(patch.mock.calls[0][1]).not.toHaveProperty('departmentId');
  });
});
