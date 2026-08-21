/**
 * The bar's interactive contract: tokens render, the menu resolves a typed value to the
 * right filter, exclusivity is explained rather than silent, and Backspace on an empty
 * field drops the last token.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { FilterTokenBar } from '../FilterTokenBar';
import { buildFilterDefs, EMPTY_DYNAMIC_OPTIONS } from '../filterSchema';
import type { FilterState } from '@/stores/messagesStore';

afterEach(cleanup);

const defs = buildFilterDefs({
  ...EMPTY_DYNAMIC_OPTIONS,
  assignees: [{ value: 'unassigned', label: 'Unassigned' }],
  departments: [{ value: '1', label: 'Support' }],
});

const setup = (filters: FilterState = {} as FilterState) => {
  const onFilterChange = vi.fn();
  const onFilterPatch = vi.fn();
  const onCommitSearch = vi.fn();
  render(
    <FilterTokenBar
      defs={defs}
      filters={filters}
      isKanban={false}
      onFilterChange={onFilterChange}
      onFilterPatch={onFilterPatch}
      onCommitSearch={onCommitSearch}
    />
  );
  return {
    onFilterChange,
    onFilterPatch,
    onCommitSearch,
    input: screen.getByLabelText(/filter or search/i),
  };
};

describe('FilterTokenBar', () => {
  it('renders one token per active filter', () => {
    setup({ lifecycle: 'open', priority: 'high' } as FilterState);
    expect(screen.getByText('Open')).toBeTruthy();
    expect(screen.getByText('High')).toBeTruthy();
  });

  it('browses the whole filter set when opened with an empty query', () => {
    const { input } = setup();
    fireEvent.mouseDown(input);
    // The browse state is what replaces the old always-open panel.
    expect(screen.getByText('Common')).toBeTruthy();
    expect(screen.getByText('Routing')).toBeTruthy();
    expect(screen.getByText('AI & links')).toBeTruthy();
  });

  it('omits a group entirely when the workspace has none of its filters', () => {
    // Routing is Source / Sent to / Department — all workspace-supplied. With none of
    // them there is no group heading standing over an empty section.
    cleanup();
    render(
      <FilterTokenBar
        defs={buildFilterDefs(EMPTY_DYNAMIC_OPTIONS)}
        filters={{} as FilterState}
        isKanban={false}
        onFilterChange={vi.fn()}
        onFilterPatch={vi.fn()}
        onCommitSearch={vi.fn()}
      />
    );
    fireEvent.mouseDown(screen.getByLabelText(/filter or search/i));
    expect(screen.queryByText('Routing')).toBeNull();
    expect(screen.getByText('Common')).toBeTruthy();
  });

  it('applies a VALUE typed without its filter name', () => {
    const { input, onFilterChange } = setup();
    fireEvent.mouseDown(input);
    fireEvent.change(input, { target: { value: 'spam' } });
    fireEvent.click(screen.getByText('Spam'));
    expect(onFilterChange).toHaveBeenCalledWith('queue', 'spam');
  });

  it('turns a query with no filter match into a search', () => {
    const { input, onCommitSearch } = setup();
    fireEvent.mouseDown(input);
    fireEvent.change(input, { target: { value: 'refund' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommitSearch).toHaveBeenCalledWith('refund');
  });

  it('explains an exclusivity swap instead of silently resetting the other filter', () => {
    const { input, onFilterChange } = setup({ lifecycle: 'open' } as FilterState);
    fireEvent.mouseDown(input);
    fireEvent.change(input, { target: { value: 'spam' } });
    fireEvent.click(screen.getByText('Spam'));
    expect(onFilterChange).toHaveBeenCalledWith('queue', 'spam');
    expect(onFilterChange).toHaveBeenCalledWith('lifecycle', 'all');
    expect(screen.getByText(/Status was cleared/i)).toBeTruthy();
  });

  it('leaves the other filter alone when there is nothing to swap', () => {
    const { input, onFilterChange } = setup();
    fireEvent.mouseDown(input);
    fireEvent.change(input, { target: { value: 'spam' } });
    fireEvent.click(screen.getByText('Spam'));
    expect(onFilterChange).not.toHaveBeenCalledWith('lifecycle', 'all');
    expect(screen.queryByText(/was cleared/i)).toBeNull();
  });

  it('drops the last token on Backspace in an empty field', () => {
    const { input, onFilterPatch } = setup({
      lifecycle: 'open',
      priority: 'high',
    } as FilterState);
    fireEvent.keyDown(input, { key: 'Backspace' });
    // Schema order puts priority last, so that is the one that goes. Removal is a patch
    // because some filters are more than one field — see `clearPatch`.
    expect(onFilterPatch).toHaveBeenCalledWith({ priority: 'all' });
  });

  it('does NOT drop a token when the field has text to delete', () => {
    const { input, onFilterChange } = setup({ lifecycle: 'open' } as FilterState);
    fireEvent.change(input, { target: { value: 'hi' } });
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onFilterChange).not.toHaveBeenCalled();
  });

  it('clears a filter from its token', () => {
    const { onFilterPatch } = setup({ priority: 'high' } as FilterState);
    fireEvent.click(screen.getByLabelText('Remove Priority filter'));
    expect(onFilterPatch).toHaveBeenCalledWith({ priority: 'all' });
  });

  it('turns a flag off with false, not with "all"', () => {
    const { onFilterPatch } = setup({ slaBreached: true } as FilterState);
    fireEvent.click(screen.getByLabelText('Remove SLA Breach filter'));
    expect(onFilterPatch).toHaveBeenCalledWith({ slaBreached: false });
  });
});
