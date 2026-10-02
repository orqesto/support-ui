import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { MessageAttachments, attachmentOrigin } from '../MessageAttachments';
import type { MessageEvent } from '@/types';

/**
 * The FILES-tab row: its card layout, the 14px file icon in the 28px tile, the highlight ring on
 * the row a thread chip jumped to (only that row), and an outgoing event with neither sentAt nor
 * metadata still dates its file.
 */

afterEach(cleanup);

beforeAll(() => {
  // jsdom implements no scrollIntoView; the highlight effect scrolls the row into view.
  Element.prototype.scrollIntoView = () => {};
});

const pdf = (id: number) =>
  ({
    id,
    originalFilename: `file-${id}.pdf`,
    filename: 'stored.pdf',
    mimeType: 'application/pdf',
    size: 2048,
  }) as never;

describe('FILES-tab rows', () => {
  it('a row is a bordered flex card and a non-image shows the 14px file icon', () => {
    render(<MessageAttachments message={{ id: 1 } as never} preloadedAttachments={[pdf(1)]} />);
    const row = screen.getByTestId('file-row');
    const classes = row.className.split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(['flex', 'items-center', 'border', 'bg-card']));
    expect(classes).toContain('border-border');
    const icon = row.querySelector('svg') as SVGElement;
    const iconClasses = (icon.getAttribute('class') ?? '').split(/\s+/);
    expect(iconClasses).toEqual(expect.arrayContaining(['w-3.5', 'h-3.5']));
  });

  it('the highlighted row (jumped to from a thread chip) alone carries the ring', () => {
    render(
      <MessageAttachments
        message={{ id: 1 } as never}
        preloadedAttachments={[pdf(1), pdf(2)]}
        highlightId={2}
      />
    );
    const [first, second] = screen.getAllByTestId('file-row');
    expect(second.className).toContain('ring-1');
    expect(second.className).toContain('border-primary-line');
    expect(second.className).not.toContain('border-border');
    expect(first.className).not.toContain('ring-1');
    expect(first.className).toContain('border-border');
  });
});

describe('attachmentOrigin — an outgoing event with no sentAt and no metadata', () => {
  it('dates the file by the event createdAt instead of throwing', () => {
    const event = {
      id: 9,
      type: 'outbound',
      authorName: 'Sam',
      authorEmail: 'sam@shop.example',
      sentAt: null,
      metadata: null,
      createdAt: '2026-09-20T08:00:00Z',
    } as unknown as MessageEvent;
    const origin = attachmentOrigin(
      { ...(pdf(5) as object), messageEventId: 9 } as never,
      new Map([[9, event]])
    );
    expect(origin).toEqual({ who: 'Sam', when: '2026-09-20T08:00:00Z', outgoing: true });
  });
});
