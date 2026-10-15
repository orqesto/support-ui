import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, cleanup, waitFor } from '@testing-library/react';
import type { Message } from '@/types';
import { chooseOption } from '@/test/chooseOption';

const route = vi.hoisted(() => ({ calls: [] as unknown[][], notes: [] as unknown[] }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: () => {} }),
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartmentById: () => null,
  useDepartments: () => ({
    data: [
      { id: 1, name: 'Support', active: true },
      { id: 3, name: 'Sales', active: true },
    ],
  }),
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true, isOrgAdmin: true }),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (s: unknown) => unknown) => select({ user: { id: 1, role: 'admin' } }),
}));
vi.mock('@/services/message.service', () => ({
  messageService: {
    manualRoute: (...args: unknown[]) => {
      route.calls.push(args);
      return Promise.resolve({ learningRecorded: true });
    },
  },
}));
vi.mock('@/lib/routingCopy', () => ({
  showRouteLearningNote: (result: unknown) => {
    route.notes.push(result);
  },
}));
vi.mock('@/components/messages/WhyParked', () => ({ WhyParked: () => null }));
vi.mock('@/components/admin/AssignmentSelect', () => ({ AssignmentSelect: () => null }));

const { HeaderMetaStrip } = await import('../HeaderMetaStrip');

afterEach(() => {
  cleanup();
  route.calls = [];
  route.notes = [];
});

const base = {
  id: 41,
  channel: 'email',
  sender: 'buyer@shop.example',
  subject: 'Wrong team',
  status: 'open',
  departmentId: 1,
  needsHumanReview: false,
  createdAt: '2026-10-14T10:00:00Z',
  metadata: {},
};

function renderStrip(message: Message) {
  render(
    <HeaderMetaStrip
      message={message}
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
      onCreateLabel={() => {}}
    />
  );
}

describe('HeaderMetaStrip — re-route without an opt-in', () => {
  it('offers no "Create rule" toggle, routes with (id, departmentId) and shows the learning note', async () => {
    renderStrip(base as unknown as Message);
    fireEvent.click(screen.getByTitle('Click to change department'));
    expect(screen.queryByText('Create rule')).toBeNull();
    await chooseOption(screen.getByRole('combobox', { name: 'Department' }), 'Sales');
    await waitFor(() => expect(route.calls).toEqual([[41, 3]]));
    await waitFor(() => expect(route.notes).toEqual([{ learningRecorded: true }]));
  });

  it('picking the same department on an active conversation does nothing', async () => {
    renderStrip(base as unknown as Message);
    fireEvent.click(screen.getByTitle('Click to change department'));
    await chooseOption(screen.getByRole('combobox', { name: 'Department' }), 'Support');
    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Department' })).toBeNull());
    expect(route.calls).toEqual([]);
    expect(route.notes).toEqual([]);
  });

  it('a needs_routing conversation routes even to its placeholder department', async () => {
    renderStrip({ ...base, status: 'needs_routing' } as unknown as Message);
    fireEvent.click(screen.getByTitle('Click to change department'));
    await chooseOption(screen.getByRole('combobox', { name: 'Department' }), 'Support');
    await waitFor(() => expect(route.calls).toEqual([[41, 1]]));
  });
});
