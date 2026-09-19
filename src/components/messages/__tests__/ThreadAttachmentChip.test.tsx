/**
 * An attached photo must look like the photo.
 *
 * ⛔ It did not: the thread rendered every attachment as a paperclip and a filename, so an
 * agent could not see what a customer had sent without downloading it — while the FILES tab
 * had shown thumbnails all along. The thread is where the conversation is read.
 *
 * The fallback is asserted as hard as the happy path. Of 24 image attachments measured on
 * staging, one reported ZERO bytes, and a file missing from storage answers 404; either would
 * render as a broken frame, which is worse than the chip it replaced.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ThreadAttachmentChip } from '../ThreadAttachmentChip';
import type { Attachment } from '@/types/ai';

afterEach(cleanup);

const attachment = (over: Partial<Attachment>): Attachment =>
  ({
    id: 99,
    originalFilename: 'roof-detail.jpg',
    filename: 'stored-name.jpg',
    mimeType: 'image/jpeg',
    fileSize: 140_000,
    ...over,
  }) as unknown as Attachment;

describe('ThreadAttachmentChip', () => {
  it('shows an image attachment as a picture', () => {
    const { container } = render(<ThreadAttachmentChip attachment={attachment({})} className="" />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toContain('/api/attachments/99/download');
    expect(img?.getAttribute('alt')).toBe('roof-detail.jpg');
  });

  it('does not fetch it until it is scrolled to', () => {
    // Load-bearing, not decoration: there is no server-side thumbnail, so the original bytes
    // are what a preview costs — 4.1MB for the largest measured on staging.
    const { container } = render(<ThreadAttachmentChip attachment={attachment({})} className="" />);
    expect(container.querySelector('img')?.getAttribute('loading')).toBe('lazy');
  });

  it('keeps the filename reachable, since the picture replaced the text that carried it', () => {
    render(<ThreadAttachmentChip attachment={attachment({})} className="" />);
    expect(screen.getByLabelText('roof-detail.jpg')).toBeTruthy();
  });

  it('⛔ a PDF is still a paperclip and a filename', () => {
    const { container } = render(
      <ThreadAttachmentChip
        attachment={attachment({ mimeType: 'application/pdf', originalFilename: 'quote.pdf' })}
        className=""
      />
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('quote.pdf')).toBeTruthy();
  });

  it('⛔ falls back to the chip when the image cannot load — never a broken frame', () => {
    const { container } = render(<ThreadAttachmentChip attachment={attachment({})} className="" />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    fireEvent.error(img as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('roof-detail.jpg')).toBeTruthy();
  });

  it('opens the attachment when clicked, exactly as the chip did', () => {
    const onOpen = vi.fn();
    render(<ThreadAttachmentChip attachment={attachment({})} onOpen={onOpen} className="" />);
    fireEvent.click(screen.getByLabelText('roof-detail.jpg'));
    expect(onOpen).toHaveBeenCalledWith(99);
  });
});
