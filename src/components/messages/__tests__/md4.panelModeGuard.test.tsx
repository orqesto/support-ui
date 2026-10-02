/**
 * The rail's tabs (phone, slide-over) switch the composer's mode — Notes to Internal note, every
 * other tab, Thread and closing a tab back to Reply. The composer holds ONE text for both modes,
 * so that flip must never carry an unsent internal note into Reply: it would sit one Send from the
 * customer, and "Add to my reply" would append to it. A BLANK composer still flips, as before.
 * Real MessageDetail + real MessagePanelTabs; shared mocks: md4.mobile.utils.tsx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setViewport, renderDetail, composer, svc, stubs } from './md4.mobile.utils';
import { screen, fireEvent, within } from '@testing-library/react';

// In each test file, not the shared utils (servicePathsCarryApiPrefix.test.ts reads non-tests).
vi.mock('@/lib/api-client', () => {
  const fns: Record<string, ReturnType<typeof vi.fn>> = {};
  return {
    apiClient: new Proxy(fns, {
      get: (target, key: string) => {
        if (!(key in target)) target[key] = vi.fn().mockResolvedValue([]);
        return target[key];
      },
    }),
  };
});

const NOTE = '<p>for the team only</p>';
const railTab = (name: string) =>
  within(screen.getByTestId('panel-tabs-root')).getByRole('button', {
    name: new RegExp(`^${name}`),
  });
const editor = () => within(composer()).getByTestId<HTMLTextAreaElement>('rich-text-editor');
const mode = () =>
  within(composer()).getByRole('button', { name: 'Internal note' }).getAttribute('aria-pressed') ===
  'true'
    ? 'note'
    : 'reply';
const writeNote = () => {
  fireEvent.click(railTab('Notes'));
  expect(mode()).toBe('note');
  fireEvent.change(editor(), { target: { value: NOTE } });
};

beforeEach(() => {
  stubs.panel = false;
  svc.message.getSimilarResolvedMessages = vi.fn().mockResolvedValue({ success: true, data: [] });
  svc.message.getKBReferences = vi.fn().mockResolvedValue({ success: true, data: [] });
});

describe.each([
  ['phone', true],
  ['slide-over', false],
])('%s rail: an unsent internal note is never flipped to Reply', (_where, phone) => {
  beforeEach(() => setViewport(phone));

  it('note typed → Customer tab: still an internal note, text kept', () => {
    renderDetail();
    writeNote();
    fireEvent.click(railTab('Customer'));
    expect(mode()).toBe('note');
    expect(editor().value).toBe(NOTE);
  });

  it('note typed → Thread tab, and closing the open tab: still an internal note', () => {
    renderDetail();
    writeNote();
    fireEvent.click(railTab('Thread'));
    expect(mode()).toBe('note');
    fireEvent.click(railTab('AI'));
    fireEvent.click(railTab('AI')); // the open tab again closes it
    expect(mode()).toBe('note');
    expect(editor().value).toBe(NOTE);
  });

  it('CONTROL: a blank composer in note mode still flips to Reply on the Customer tab', () => {
    renderDetail();
    fireEvent.click(railTab('Notes'));
    expect(mode()).toBe('note');
    fireEvent.click(railTab('Customer'));
    expect(mode()).toBe('reply');
  });

  it('CONTROL: a whitespace-only note is blank — it flips', () => {
    renderDetail();
    fireEvent.click(railTab('Notes'));
    fireEvent.change(editor(), { target: { value: '<p> </p>' } });
    fireEvent.click(railTab('Customer'));
    expect(mode()).toBe('reply');
  });

  it('the Notes tab still switches a reply being written to note mode (as before)', () => {
    renderDetail();
    fireEvent.change(editor(), { target: { value: '<p>hello</p>' } });
    fireEvent.click(railTab('Notes'));
    expect(mode()).toBe('note');
  });
});
