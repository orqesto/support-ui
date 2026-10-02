/**
 * The FILES-tab meta line, "size · who · when", when the owning event names nobody: an incoming
 * event with no From address and no relay gives `who: null`, and the line must drop that part —
 * not print "null" and not leave a double separator.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { MessageAttachments } from '../MessageAttachments';
import { relativeTime } from '../messageDetailConstants';

afterEach(cleanup);

const when = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
const attachment = {
  id: 501,
  originalFilename: 'invoice.pdf',
  filename: 'stored.pdf',
  mimeType: 'application/pdf',
  size: 12 * 1024,
  messageEventId: 9,
} as never;

const renderRow = (authorEmail: string | null) =>
  render(
    <MessageAttachments
      message={{ id: 1 } as never}
      preloadedAttachments={[attachment]}
      sortedThread={
        [{ id: 9, type: 'inbound', authorEmail, metadata: null, createdAt: when }] as never
      }
    />
  );

describe('the FILES-tab meta line with nobody to name', () => {
  it('no author ⇒ "12.0 KB · <when>": no "null", no double separator', () => {
    renderRow(null);
    const origin = screen.getByTestId('file-origin');
    const line = origin.parentElement!.textContent ?? '';
    expect(line).not.toContain('null');
    expect(line).not.toMatch(/·\s*·/);
    expect(line.replace(/\s+/g, ' ').trim()).toBe(`12.0 KB · ${relativeTime(when)}`);
  });

  it('CONTROL: with an author the line names them between size and time', () => {
    renderRow('jane@example.com');
    const line = screen.getByTestId('file-origin').parentElement!.textContent ?? '';
    expect(line.replace(/\s+/g, ' ').trim()).toBe(
      `12.0 KB · jane@example.com · ${relativeTime(when)}`
    );
  });
});

describe('the FILES-tab "when" of an incoming message', () => {
  it('is when the message was RECEIVED (metadata.receivedAt), not when it was imported', () => {
    const receivedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const importedAt = new Date().toISOString();
    render(
      <MessageAttachments
        message={{ id: 1 } as never}
        preloadedAttachments={[attachment]}
        sortedThread={
          [
            {
              id: 9,
              type: 'inbound',
              authorEmail: 'jane@example.com',
              metadata: { receivedAt },
              createdAt: importedAt,
            },
          ] as never
        }
      />
    );
    expect(relativeTime(receivedAt)).not.toBe(relativeTime(importedAt));
    const line = screen.getByTestId('file-origin').parentElement!.textContent ?? '';
    expect(line.replace(/\s+/g, ' ').trim()).toBe(
      `12.0 KB · jane@example.com · ${relativeTime(receivedAt)}`
    );
  });
});
