/**
 * The Labels row used to be gated on `allLabels.length > 0`. That hid the ONLY inline
 * path to the first label: the "Create …" affordance lives inside the picker, behind the
 * add button, which lived inside the hidden row. A workspace with no labels could never
 * create one from a message — the control appeared only once you no longer needed it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
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
  showLabelPicker?: boolean;
  labelsStatus?: 'loading' | 'ready' | 'error';
  onRetryLabels?: () => void;
  onToggleLabelPicker?: () => void;
}) =>
  render(
    <HeaderMetaStrip
      message={message}
      categories={[]}
      messageLabels={over.messageLabels ?? []}
      allLabels={over.allLabels ?? []}
      hasManageLabels={over.hasManageLabels ?? true}
      showLabelPicker={over.showLabelPicker ?? false}
      labelsStatus={over.labelsStatus}
      onRetryLabels={over.onRetryLabels}
      updatingCategory={false}
      onSetCategory={vi.fn()}
      onToggleLabel={vi.fn()}
      onToggleLabelPicker={over.onToggleLabelPicker ?? vi.fn()}
      onCloseLabelPicker={vi.fn()}
      onCreateLabel={'onCreateLabel' in over ? over.onCreateLabel : vi.fn()}
    />
  );

describe('HeaderMetaStrip — the Labels row with an empty workspace', () => {
  it('offers "Add label" even when the workspace has NO labels yet', () => {
    renderStrip({ allLabels: [] });
    expect(screen.getByLabelText('Add label')).toBeTruthy();
  });

  it('the open picker says "Loading labels…" / "Couldn’t load labels." until labels are really known', () => {
    const { unmount } = renderStrip({ allLabels: [], showLabelPicker: true, labelsStatus: 'loading' });
    expect(screen.getByText('Loading labels…')).toBeTruthy();
    unmount();
    renderStrip({ allLabels: [], showLabelPicker: true, labelsStatus: 'error' });
    expect(screen.getByText('Couldn’t load labels.')).toBeTruthy();
    expect(screen.queryByText(/No labels yet/)).toBeNull();
  });

  it('offers "Create …" only once the label list is known', () => {
    const { unmount } = renderStrip({ allLabels: [], showLabelPicker: true, labelsStatus: 'loading' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Labels' }), { target: { value: 'Bug' } });
    expect(screen.queryByText(/^Create /)).toBeNull();
    unmount();
    renderStrip({ allLabels: [], showLabelPicker: true, labelsStatus: 'ready' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Labels' }), { target: { value: 'Bug' } });
    expect(screen.getByText('Create "Bug"')).toBeTruthy();
  });

  it('opening the picker after a failed load asks the parent to retry; no "or create" meanwhile', () => {
    const onRetryLabels = vi.fn();
    renderStrip({ allLabels: [], labelsStatus: 'error', onRetryLabels });
    fireEvent.click(screen.getByLabelText('Add label'));
    expect(onRetryLabels).toHaveBeenCalledTimes(1);
    cleanup();
    renderStrip({ allLabels: [], showLabelPicker: true, labelsStatus: 'error' });
    expect(screen.queryByText('Search or create…')).toBeNull();
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

/**
 * The picker must stay inside the page it opens on (staging, 2026-09-29).
 *
 * Near the right edge it was placed as if 176 px wide while drawn at 200, against `innerWidth`
 * (which counts the scrollbar). Being `absolute` in <body>, it widened the document by up to
 * 27 px, and its autofocused search box scrolled the whole page sideways. jsdom has no layout, so
 * the button's position and the visible width are given here; the picker's width is READ from
 * what it renders, so the test cannot agree with a wrong constant.
 */
describe('HeaderMetaStrip — the label picker stays on the page', () => {
  const open = (buttonLeft: number, visibleWidth: number, scrollX = 0) => {
    Object.defineProperty(document.documentElement, 'clientWidth', {
      configurable: true,
      value: visibleWidth,
    });
    Object.defineProperty(window, 'scrollX', { configurable: true, value: scrollX });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: buttonLeft,
      right: buttonLeft + 28,
      top: 261,
      bottom: 281,
      width: 28,
      height: 20,
      x: buttonLeft,
      y: 261,
      toJSON: () => ({}),
    });
    render(
      <HeaderMetaStrip
        message={message}
        categories={[]}
        messageLabels={[]}
        allLabels={[]}
        hasManageLabels
        showLabelPicker
        updatingCategory={false}
        onSetCategory={vi.fn()}
        onToggleLabel={vi.fn()}
        onToggleLabelPicker={vi.fn()}
        onCloseLabelPicker={vi.fn()}
        onCreateLabel={vi.fn()}
      />
    );
    const picker = screen.getByRole('dialog', { name: 'Labels' });
    return { left: parseFloat(picker.style.left), width: parseFloat(picker.style.width) };
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opened near the RIGHT edge, it ends inside the visible page — the measured staging case', () => {
    // Staging: button at x=488 in a 595 px page (606 px window minus its scrollbar).
    const { left, width } = open(488, 595);
    expect(left + width).toBeLessThanOrEqual(595 - 8);
  });

  it('opened near the LEFT edge, it does not start off the page', () => {
    const { left } = open(2, 595);
    expect(left).toBeGreaterThanOrEqual(8);
  });

  it('on a page already scrolled sideways, it is placed in PAGE coordinates', () => {
    // `absolute` in <body>: without the scroll offset it would land 30 px left of the button.
    const { left } = open(100, 1200, 30);
    expect(left).toBe(130);
  });

  it('CONTROL: with room to spare it sits right under its button, not pushed anywhere', () => {
    const { left } = open(100, 1200);
    expect(left).toBe(100);
  });
});
