/**
 * The Labels row used to be gated on `allLabels.length > 0`. That hid the ONLY inline
 * path to the first label: the "Create …" affordance lives inside the picker, behind the
 * add button, which lived inside the hidden row. A workspace with no labels could never
 * create one from a message — the control appeared only once you no longer needed it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { Message } from '@/types';
import type { Label } from '@/services/settings.service';

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartmentById: () => null,
  useDepartments: () => ({ data: [] }),
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true, isOrgAdmin: true }),
}));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ id: 1, role: 'admin' }) }));
vi.mock('@/services/message.service', () => ({ messageService: {} }));
vi.mock('@/components/admin/AssignmentSelect', () => ({ AssignmentSelect: () => null }));
vi.mock('@/components/ui/ReactSelect', () => ({ ReactSelect: () => null }));

const { HeaderMetaStrip } = await import('../HeaderMetaStrip');

afterEach(cleanup);

const message: Message = {
  id: 1,
  channel: 'email',
  sender: 'customer@example.com',
  subject: 'Test',
  status: 'open',
  needsHumanReview: false,
  createdAt: '2026-01-01T10:00:00Z',
  metadata: {},
} as Message;

const renderStrip = (over: {
  allLabels?: Label[];
  messageLabels?: Label[];
  hasManageLabels?: boolean;
  onCreateLabel?: (name: string) => void;
}) =>
  render(
    <HeaderMetaStrip
      message={message}
      categories={[]}
      messageLabels={over.messageLabels ?? []}
      allLabels={over.allLabels ?? []}
      hasManageLabels={over.hasManageLabels ?? true}
      showLabelPicker={false}
      updatingCategory={false}
      onSetCategory={vi.fn()}
      onToggleLabel={vi.fn()}
      onToggleLabelPicker={vi.fn()}
      onCloseLabelPicker={vi.fn()}
      onCreateLabel={'onCreateLabel' in over ? over.onCreateLabel : vi.fn()}
    />
  );

describe('HeaderMetaStrip — the Labels row with an empty workspace', () => {
  it('offers "Add label" even when the workspace has NO labels yet', () => {
    renderStrip({ allLabels: [] });
    expect(screen.getByLabelText('Add label')).toBeTruthy();
  });

  it('still offers it once labels exist', () => {
    renderStrip({ allLabels: [{ id: 1, name: 'Bug', color: '#f00' } as Label] });
    expect(screen.getByLabelText('Add label')).toBeTruthy();
  });

  // Controls — the row must NOT appear when there is nothing to see and nothing to do.
  it('hides the row for a viewer who cannot manage labels and has none to show', () => {
    renderStrip({ allLabels: [], hasManageLabels: false });
    expect(screen.queryByLabelText('Add label')).toBeNull();
    expect(screen.queryByText('Labels')).toBeNull();
  });

  it('hides the row when no create handler is supplied and there is nothing to show', () => {
    renderStrip({ allLabels: [], onCreateLabel: undefined });
    expect(screen.queryByText('Labels')).toBeNull();
  });

  it('still shows labels already ON the message even if the picker cannot create', () => {
    renderStrip({
      allLabels: [],
      messageLabels: [{ id: 7, name: 'Urgent', color: '#00f' } as Label],
      hasManageLabels: false,
    });
    expect(screen.getByText('Urgent')).toBeTruthy();
  });
});
