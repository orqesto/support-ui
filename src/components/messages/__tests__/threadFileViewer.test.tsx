/**
 * Thread details → the file viewer, with REAL thread rows (ThreadMessageItem → ThreadBubble →
 * ThreadAttachmentChip) and the real viewer: pressing an attached file or a picture in the text
 * opens it at once over the thread, and next/previous walks the WHOLE conversation in thread
 * order — per message, the pictures in its text, then its attachments.
 *
 * ⚠️ jsdom computes no layout and loads no images, so the "tiny image" rule is driven here by
 * the declared `width`/`height` attributes and by a stubbed `naturalWidth`; the RENDERED-size
 * branch (getBoundingClientRect) can only be checked in a real browser.
 */
import { useRef } from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { MessageEvent } from '@/types';
import type { Attachment } from '@/types/ai';

const htmlById = vi.hoisted(() => new Map<number, string>());
vi.mock('@/hooks/useMessageHtml', () => ({
  useMessageHtml: (eventId: number | undefined) => ({
    data: eventId === undefined ? null : (htmlById.get(eventId) ?? null),
    isLoading: false,
  }),
}));
vi.mock('@/components/shared/TranslateButton', () => ({ TranslateButton: () => null }));
const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({ apiClient: { get: apiGet } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { ThreadMessageItem } from '../ThreadMessageItem';
import { useThreadFileViewer } from '../useThreadFileViewer';

const message = (id: number, content: string): MessageEvent =>
  ({
    id,
    conversationId: 10,
    type: 'inbound',
    content,
    authorEmail: 'customer@example.test',
    channel: 'email',
    createdAt: `2026-11-0${id}T10:00:00Z`,
    metadata: null,
    recipients: null,
  }) as unknown as MessageEvent;

const attachment = (id: number, eventId: number, mimeType: string, name: string): Attachment =>
  ({
    id,
    messageEventId: eventId,
    mimeType,
    originalFilename: name,
    size: 5000,
  }) as Attachment;

const thread = [message(1, 'Look'), message(2, 'Second')];
const attachments = new Map<number, Attachment[]>([
  [1, [attachment(21, 1, 'image/jpeg', 'box.jpg')]],
  [2, [attachment(22, 2, 'application/pdf', 'invoice.pdf')]],
]);

const Thread = ({
  rows = thread,
  files = attachments,
}: {
  rows?: MessageEvent[];
  files?: Map<number, Attachment[]>;
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewer = useThreadFileViewer(rootRef, rows, files, 1);
  return (
    <div ref={rootRef} data-testid="thread">
      {rows.map((msg) => (
        <ThreadMessageItem
          key={msg.id}
          msg={msg}
          attachments={files.get(msg.id) ?? []}
          onOpenAttachment={viewer.openAttachment}
          onOpenInlineImage={viewer.openInlineImage}
        />
      ))}
      {viewer.viewer}
    </div>
  );
};

const viewerTitle = () => screen.getByTestId('file-viewer').querySelector('h2')?.textContent;

beforeEach(() => {
  htmlById.set(
    1,
    '<p>Look</p>' +
      '<img src="https://cdn.example.test/damaged.jpg" alt="Damaged box" width="600" height="400">' +
      '<img src="https://cdn.example.test/pixel.gif" alt="pixel" width="1" height="1">' +
      '<a href="https://shop.example.test/order"><img src="https://cdn.example.test/banner.jpg" alt="Shop banner" width="600" height="120"></a>'
  );
  htmlById.set(2, '<p>Second</p><img src="https://cdn.example.test/label.jpg" alt="Label">');
  apiGet.mockResolvedValue({ data: new Blob(['%PDF']) });
  vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: vi.fn() });
});

afterEach(() => {
  cleanup();
  htmlById.clear();
  vi.unstubAllGlobals();
  apiGet.mockReset();
});

describe('thread → file viewer', () => {
  it('pressing an attached photo opens the VIEWER at that file, counted in the whole thread', () => {
    render(<Thread />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'box.jpg' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(viewerTitle()).toBe('box.jpg');
    // damaged (m1 text) · box.jpg (m1) · Label (m2 text) · invoice.pdf (m2)
    expect(screen.getByText('2 of 4')).toBeTruthy();
  });

  it('pressing a picture in the message text opens it', () => {
    render(<Thread />);
    fireEvent.click(screen.getByAltText('Damaged box'));
    expect(viewerTitle()).toBe('Damaged box');
    expect(screen.getByText('1 of 4')).toBeTruthy();
  });

  it('a tracking pixel and a picture inside a link do NOT open it', () => {
    render(<Thread />);
    fireEvent.click(screen.getByAltText('pixel'));
    fireEvent.click(screen.getByAltText('Shop banner'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByAltText('pixel').getAttribute('role')).toBeNull();
    expect(screen.getByAltText('Damaged box').getAttribute('role')).toBe('button');
  });

  it('a picture that LOADS smaller than 48px stops being a button (natural size)', () => {
    render(<Thread />);
    const label = screen.getByAltText('Label');
    Object.defineProperty(label, 'complete', { value: true });
    Object.defineProperty(label, 'naturalWidth', { value: 16 });
    Object.defineProperty(label, 'naturalHeight', { value: 16 });
    fireEvent.load(label);
    expect(label.getAttribute('role')).toBeNull();
    fireEvent.click(label);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Enter on a picture opens it (keyboard)', () => {
    render(<Thread />);
    const picture = screen.getByAltText('Damaged box');
    expect(picture.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(picture, { key: 'Enter' });
    expect(viewerTitle()).toBe('Damaged box');
  });

  it('next/previous and ←/→ walk across messages in thread order', () => {
    render(<Thread />);
    fireEvent.click(screen.getByRole('button', { name: 'box.jpg' }));
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(viewerTitle()).toBe('Label');
    expect(screen.getByText('3 of 4')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next file' }));
    expect(viewerTitle()).toBe('invoice.pdf');
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    fireEvent.click(screen.getByRole('button', { name: 'Previous file' }));
    expect(viewerTitle()).toBe('Damaged box');
  });

  it('works on OUR replies too (the agent-side bubble)', () => {
    htmlById.set(
      3,
      '<p>Here is the label</p><img src="https://cdn.example.test/out.jpg" alt="Our label">'
    );
    const reply = { ...message(3, 'Here is the label'), type: 'agent_reply' } as MessageEvent;
    render(<Thread rows={[...thread, reply]} />);
    fireEvent.click(screen.getByAltText('Our label'));
    expect(viewerTitle()).toBe('Our label');
    expect(screen.getByText('5 of 5')).toBeTruthy();
  });

  describe('a tiny attached picture (signature icon, tracking pixel)', () => {
    const withIcon = new Map<number, Attachment[]>([
      [1, [attachment(21, 1, 'image/jpeg', 'box.jpg'), attachment(23, 1, 'image/png', 'icon.png')]],
      [2, [attachment(22, 2, 'application/pdf', 'invoice.pdf')]],
    ]);
    const loadThumb = (name: string, size: number) => {
      const thumb = screen.getByRole('button', { name }).querySelector('img') as HTMLImageElement;
      Object.defineProperty(thumb, 'complete', { value: true });
      Object.defineProperty(thumb, 'naturalWidth', { value: size });
      Object.defineProperty(thumb, 'naturalHeight', { value: size });
    };

    it('is left out of next/previous once its thumbnail has loaded small', () => {
      render(<Thread files={withIcon} />);
      loadThumb('icon.png', 16);
      fireEvent.click(screen.getByRole('button', { name: 'box.jpg' }));
      // damaged (m1 text) · box.jpg · Label (m2 text) · invoice.pdf — no icon.png
      expect(screen.getByText('2 of 4')).toBeTruthy();
      fireEvent.keyDown(document.body, { key: 'ArrowRight' });
      expect(viewerTitle()).toBe('Label');
    });

    it('still opens when the agent presses it', () => {
      render(<Thread files={withIcon} />);
      loadThumb('icon.png', 16);
      fireEvent.click(screen.getByRole('button', { name: 'icon.png' }));
      expect(viewerTitle()).toBe('icon.png');
      expect(screen.getByText('3 of 5')).toBeTruthy();
    });

    it('CONTROL: a full-size photo, or one not loaded yet, stays in the list', () => {
      render(<Thread files={withIcon} />);
      loadThumb('icon.png', 600);
      fireEvent.click(screen.getByRole('button', { name: 'box.jpg' }));
      expect(screen.getByText('2 of 5')).toBeTruthy();
      cleanup();
      render(<Thread files={withIcon} />);
      fireEvent.click(screen.getByRole('button', { name: 'box.jpg' }));
      expect(screen.getByText('2 of 5')).toBeTruthy();
    });
  });

  it('Escape closes it and the thread is the same, never re-mounted', () => {
    render(<Thread />);
    const bubbleText = screen.getByText('Look');
    fireEvent.click(screen.getByRole('button', { name: 'box.jpg' }));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(bubbleText.isConnected).toBe(true);
    expect(screen.getByText('Look')).toBe(bubbleText);
  });
});
