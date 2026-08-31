import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, renderHook, act } from '@testing-library/react';
import { ConfigCard } from '@/components/ui/ConfigCard';
import { useConfigCardState } from '@/hooks/useConfigCardState';

afterEach(cleanup);

/**
 * The shell exists to make one bug impossible: a form showing a draft as though it
 * were the live config. It does that by never rendering the editable form outside the
 * `editing` state, and never rendering the read-only summary inside it.
 */
describe('ConfigCard', () => {
  it('offers to configure, and explains what happens meanwhile, when nothing is stored', () => {
    render(
      <ConfigCard
        title="Object Storage"
        state="empty"
        emptyNote="Files are using managed storage."
        onConfigure={vi.fn()}
      />
    );

    expect(screen.getByText('Files are using managed storage.')).toBeTruthy();
    expect(screen.getByText('Not set')).toBeTruthy();
    expect(screen.getByRole('button', { name: /configure/i })).toBeTruthy();
  });

  it('renders the summary and NOT the form when config is stored', () => {
    render(
      <ConfigCard
        title="Object Storage"
        state="stored"
        summary={[{ label: 'Bucket', value: 'tc-spt-s3-documents' }]}
        onEdit={vi.fn()}
      >
        <input placeholder="the editable form" />
      </ConfigCard>
    );

    expect(screen.getByText('tc-spt-s3-documents')).toBeTruthy();
    expect(screen.getByText('In use')).toBeTruthy();
    expect(screen.queryByPlaceholderText('the editable form')).toBeNull();
  });

  it('renders the form and NOT the summary while editing', () => {
    render(
      <ConfigCard
        title="Object Storage"
        state="editing"
        summary={[{ label: 'Bucket', value: 'tc-spt-s3-documents' }]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      >
        <input placeholder="the editable form" />
      </ConfigCard>
    );

    expect(screen.getByPlaceholderText('the editable form')).toBeTruthy();
    expect(screen.queryByText('tc-spt-s3-documents')).toBeNull();
    expect(screen.getByText('Unsaved')).toBeTruthy();
  });

  it('shows provenance beside a value, and a placeholder instead when there is none', () => {
    render(
      <ConfigCard
        title="Object Storage"
        state="stored"
        summary={[
          { label: 'Region', value: 'eu-west-1', source: 'from environment' },
          { label: 'Endpoint', value: '', source: 'from console', placeholder: 'AWS (default)' },
        ]}
      />
    );

    expect(screen.getByText('from environment')).toBeTruthy();
    expect(screen.getByText('AWS (default)')).toBeTruthy();
    // Provenance is meaningless for a value that is not set.
    expect(screen.queryByText('from console')).toBeNull();
  });

  it('does not let a disabled save fire', () => {
    const onSave = vi.fn();
    render(<ConfigCard title="X" state="editing" onSave={onSave} saveDisabled />);

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSave).not.toHaveBeenCalled();
  });
});

/**
 * `stored` and `empty` are DERIVED, and only `editing` is user-controlled — which is
 * what makes it impossible to get stuck showing a draft.
 */
describe('useConfigCardState', () => {
  it('derives empty and stored from whether config exists', () => {
    const { result, rerender } = renderHook(({ configured }) => useConfigCardState({ configured }), {
      initialProps: { configured: false },
    });
    expect(result.current.state).toBe('empty');

    rerender({ configured: true });
    expect(result.current.state).toBe('stored');
  });

  it('returns to the derived state when a save completes', () => {
    const { result } = renderHook(() => useConfigCardState({ configured: true }));

    act(() => result.current.startEditing());
    expect(result.current.state).toBe('editing');

    act(() => result.current.confirmSaved());
    expect(result.current.state).toBe('stored');
  });

  it('discards the draft through onCancel and leaves editing', () => {
    const onCancel = vi.fn();
    const { result } = renderHook(() => useConfigCardState({ configured: true, onCancel }));

    act(() => result.current.startEditing());
    act(() => result.current.cancelEditing());

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe('stored');
  });

  it('keeps an open editor open when the stored config changes underneath it', () => {
    const { result, rerender } = renderHook(({ configured }) => useConfigCardState({ configured }), {
      initialProps: { configured: true },
    });
    act(() => result.current.startEditing());

    // Another operator removed the config mid-edit: the draft must survive.
    rerender({ configured: false });

    expect(result.current.state).toBe('editing');
  });
});
