import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Message } from '@/types';

/** "Assigned because…" beside the assignee — only when the router said why (2026-10-21). */

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: () => undefined }),
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartmentById: () => null,
  useDepartments: () => ({ data: [] }),
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true, isOrgAdmin: true }),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (s: unknown) => unknown) => select({ user: { id: 1, role: 'admin' } }),
}));
vi.mock('@/services/message.service', () => ({ messageService: {} }));
vi.mock('@/components/messages/WhyParked', () => ({ WhyParked: () => null }));
vi.mock('@/components/admin/AssignmentSelect', () => ({ AssignmentSelect: () => null }));

const { HeaderMetaStrip } = await import('../HeaderMetaStrip');

const renderStrip = (over: Record<string, unknown>) =>
  render(
    <HeaderMetaStrip
      message={
        {
          id: 41,
          channel: 'email',
          sender: 'buyer@shop.example',
          status: 'open',
          departmentId: 1,
          assigneeId: 5,
          needsHumanReview: false,
          createdAt: '2026-10-21T10:00:00Z',
          metadata: {},
          ...over,
        } as unknown as Message
      }
      categories={[]}
      messageLabels={[]}
      allLabels={[]}
      hasManageLabels
      showLabelPicker={false}
      updatingCategory={false}
      onSetCategory={() => {}}
      onToggleLabel={() => {}}
      onToggleLabelPicker={() => {}}
      onCloseLabelPicker={() => {}}
    />
  );

describe('auto-assign reason by the assignee', () => {
  it.each([
    ['contact_manager', "Assigned automatically: contact's manager"],
    ['client_history', 'Assigned automatically: handled this customer before'],
    ['skill_match', 'Assigned automatically: skills match'],
    ['load_balance', 'Assigned automatically: least busy'],
  ])('%s → "%s"', (code, words) => {
    renderStrip({ autoRoutedReason: code });
    expect(screen.getByTestId('auto-routed-reason')).toHaveAttribute('aria-label', words);
  });

  it.each([
    ['null', { autoRoutedReason: null }],
    ['absent (older backend)', {}],
    ['an unknown code', { autoRoutedReason: 'tomorrow_s_rule' }],
    ['nobody assigned any more', { autoRoutedReason: 'load_balance', assigneeId: null }],
  ])('CONTROL — %s: nothing', (_label, over) => {
    renderStrip(over);
    expect(screen.queryByTestId('auto-routed-reason')).toBeNull();
  });
});
