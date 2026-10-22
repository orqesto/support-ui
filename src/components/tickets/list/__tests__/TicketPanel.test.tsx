import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { TicketPanel } from '../TicketPanel';
import { useTicketKeys } from '../useTicketKeys';

const keysFor = (open: boolean) => {
  const handlers = { onNext: vi.fn(), onPrev: vi.fn(), onClose: vi.fn(), onSlash: vi.fn() };
  renderHook(() => useTicketKeys({ open, ...handlers }));
  return handlers;
};

describe('useTicketKeys', () => {
  it('moves with J and K and closes with Escape while a ticket is open', () => {
    const handlers = keysFor(true);
    fireEvent.keyDown(document, { key: 'j' });
    fireEvent.keyDown(document, { key: 'k' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handlers.onNext).toHaveBeenCalledTimes(1);
    expect(handlers.onPrev).toHaveBeenCalledTimes(1);
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it('focuses search with / only when no ticket is open', () => {
    const closed = keysFor(false);
    fireEvent.keyDown(document, { key: '/' });
    expect(closed.onSlash).toHaveBeenCalledTimes(1);
    expect(closed.onNext).not.toHaveBeenCalled();
  });

  it('types instead of navigating in a text field, a textarea or an editor', () => {
    const handlers = keysFor(true);
    render(
      <div>
        <input aria-label="search" />
        <textarea aria-label="comment" />
        <div aria-label="editor" contentEditable suppressContentEditableWarning />
      </div>
    );
    for (const label of ['search', 'comment', 'editor']) {
      const field = screen.getByLabelText(label);
      fireEvent.keyDown(field, { key: 'j' });
      fireEvent.keyDown(field, { key: 'k' });
      fireEvent.keyDown(field, { key: '/' });
    }
    expect(handlers.onNext).not.toHaveBeenCalled();
    expect(handlers.onPrev).not.toHaveBeenCalled();
    expect(handlers.onSlash).not.toHaveBeenCalled();
  });

  it('leaves Escape to a field that is being typed in', () => {
    const handlers = keysFor(true);
    render(<input aria-label="title" />);
    fireEvent.keyDown(screen.getByLabelText('title'), { key: 'Escape' });
    expect(handlers.onClose).not.toHaveBeenCalled();
  });

  it('ignores shortcuts with a modifier held', () => {
    const handlers = keysFor(true);
    fireEvent.keyDown(document, { key: 'j', metaKey: true });
    expect(handlers.onNext).not.toHaveBeenCalled();
  });
});

describe('TicketPanel', () => {
  const setup = (over: Partial<Parameters<typeof TicketPanel>[0]> = {}) => {
    const props = {
      ticketId: 1182,
      prevId: 1179 as number | null,
      nextId: null as number | null,
      onGo: vi.fn(),
      onClose: vi.fn(),
      onFullPage: vi.fn(),
      onCopyLink: vi.fn(),
      children: <p>detail</p>,
      ...over,
    };
    render(<TicketPanel {...props} />);
    return props;
  };

  it('goes to the previous ticket and cannot go past the last one', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Previous ticket' }));
    expect(props.onGo).toHaveBeenCalledWith(1179);
    expect(screen.getByRole('button', { name: 'Next ticket' })).toBeDisabled();
  });

  it('opens the full page, copies the link and closes', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Open full page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(props.onFullPage).toHaveBeenCalled();
    expect(props.onCopyLink).toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  it('shows the ticket number and its detail', () => {
    setup();
    expect(screen.getByText('#1182')).toBeInTheDocument();
    expect(screen.getByText('detail')).toBeInTheDocument();
  });
});
