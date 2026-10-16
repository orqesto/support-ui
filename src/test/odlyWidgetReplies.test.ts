import { readFileSync } from 'fs';
import path from 'path';
import { runInThisContext } from 'vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The embeddable widget (public/widget/odly-widget.js) is a plain IIFE served as-is. These tests
// run the real file in jsdom with a stubbed fetch and fake timers, and pin how replies after a
// human handoff are fetched, shown and polled. All data is invented.

const WIDGET_SOURCE = readFileSync(
  path.resolve(__dirname, '../../public/widget/odly-widget.js'),
  'utf8'
);
const WIDGET_KEY = 'wk-test';
const API_URL = 'https://api.example.test';
const MESSAGES_URL = `${API_URL}/api/public/chat/${WIDGET_KEY}/messages`;
const HANDOFF_KEY = `odly_handoff_${WIDGET_KEY}`;
const SESSION_KEY = `odly_session_${WIDGET_KEY}`;

interface FakeResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}
interface FetchCall {
  url: string;
  body: Record<string, unknown> | null;
}
type Responder = (call: FetchCall) => FakeResponse | Promise<FakeResponse>;

function reply(body: unknown, status = 200): FakeResponse {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}

let calls: FetchCall[] = [];
let messagesResponder: Responder = () =>
  reply({ success: true, escalated: true, messages: [], cursor: null });
let chatResponder: Responder = () => reply({ success: true, reply: 'Hello there' });
let visibility: 'visible' | 'hidden' = 'visible';
const addedListeners: Array<[string, EventListenerOrEventListenerObject]> = [];
const originalAddListener = document.addEventListener.bind(document);

function messageCalls(): FetchCall[] {
  return calls.filter((call) => call.url === MESSAGES_URL);
}

function bootWidget(config: Record<string, unknown> = {}): void {
  (window as unknown as { OdlyChatWidget: unknown }).OdlyChatWidget = {
    widgetKey: WIDGET_KEY,
    apiUrl: API_URL,
  };
  const widgetConfig = {
    name: 'Example Shop',
    collectUserInfo: true,
    welcomeMessage: 'Hi!',
    ...config,
  };
  window.fetch = ((url: string, init?: { body?: string }) => {
    const call: FetchCall = {
      url,
      body: init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : null,
    };
    calls.push(call);
    if (url.endsWith('/config'))
      return Promise.resolve(reply({ success: true, config: widgetConfig }));
    if (url === MESSAGES_URL) return Promise.resolve(messagesResponder(call));
    return Promise.resolve(chatResponder(call));
  }) as unknown as typeof fetch;
  runInThisContext(WIDGET_SOURCE);
}

function storeHandoff(): void {
  localStorage.setItem(SESSION_KEY, 'sess-old');
  localStorage.setItem(HANDOFF_KEY, JSON.stringify({ sessionKey: 'sess-old', cursor: 7 }));
}

async function flush(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

async function openChat(): Promise<void> {
  (document.getElementById('odly-toggle') as HTMLButtonElement).click();
  await flush();
}

function setVisibility(next: 'visible' | 'hidden'): void {
  visibility = next;
  document.dispatchEvent(new Event('visibilitychange'));
}

function bubbles(side: 'assistant' | 'user'): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`.odly-msg-${side}`));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  calls = [];
  visibility = 'visible';
  localStorage.clear();
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  document.addEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    opts?: unknown
  ) => {
    addedListeners.push([type, listener]);
    originalAddListener(type, listener, opts as AddEventListenerOptions);
  }) as typeof document.addEventListener;
});

afterEach(() => {
  addedListeners
    .splice(0)
    .forEach(([type, listener]) => document.removeEventListener(type, listener));
  document.addEventListener = originalAddListener;
  document.getElementById('odly-widget-root')?.remove();
  document.head.querySelectorAll('style').forEach((node) => node.remove());
  vi.useRealTimers();
});

describe('odly widget: replies after a handoff', () => {
  it('starts polling after a live escalation and renders agent and visitor replies escaped, once each', async () => {
    chatResponder = () =>
      reply({
        success: true,
        reply: 'Passing you to the team.',
        sessionKey: 'sess-new',
        escalated: true,
      });
    messagesResponder = () =>
      reply({
        success: true,
        escalated: true,
        messages: [
          { id: 12, role: 'visitor', content: 'My reply by email', sentAt: '2026-01-02T10:05:00Z' },
          {
            id: 11,
            role: 'agent',
            content: '<img src=x onerror="alert(1)"> see https://help.example.com/a',
            sentAt: '2026-01-02T10:00:00Z',
          },
        ],
        cursor: 12,
      });
    bootWidget();
    await flush();
    await openChat();
    expect(messageCalls()).toHaveLength(0);

    const input = document.getElementById('odly-input') as HTMLTextAreaElement;
    input.value = 'I want a person';
    (document.getElementById('odly-send') as HTMLButtonElement).click();
    await flush();
    expect(JSON.parse(localStorage.getItem(HANDOFF_KEY) as string)).toEqual({
      sessionKey: 'sess-new',
      cursor: 0,
    });
    expect(messageCalls()).toHaveLength(0);

    await flush(20000);
    expect(messageCalls()).toHaveLength(1);
    expect(messageCalls()[0].body).toEqual({ sessionKey: 'sess-new', after: 0 });

    const agentBubble = bubbles('assistant').find((el) => el.textContent?.includes('Support team'));
    expect(agentBubble).toBeDefined();
    expect(agentBubble?.querySelector('img')).toBeNull();
    expect(agentBubble?.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(agentBubble?.querySelector('a')?.getAttribute('href')).toBe(
      'https://help.example.com/a'
    );
    expect(bubbles('user').map((el) => el.textContent)).toEqual([
      'I want a person',
      'My reply by email',
    ]);
    // Agent (id 11) is shown before the visitor's reply (id 12).
    const order = Array.from(document.querySelectorAll('.odly-msg')).map((el) => el.textContent);
    expect(order.indexOf('My reply by email')).toBeGreaterThan(
      order.findIndex((text) => text?.includes('Support team'))
    );
    expect(JSON.parse(localStorage.getItem(HANDOFF_KEY) as string)).toEqual({
      sessionKey: 'sess-new',
      cursor: 12,
    });

    // The same events again are not shown twice; the cursor is sent.
    await flush(20000);
    expect(messageCalls()).toHaveLength(2);
    expect(messageCalls()[1].body).toEqual({ sessionKey: 'sess-new', after: 12 });
    expect(document.querySelectorAll('.odly-msg-label')).toHaveLength(1);
    expect(bubbles('user')).toHaveLength(2);
  });

  it('keeps a handed-off session after a reload and fetches every reply again on open', async () => {
    storeHandoff();
    messagesResponder = () =>
      reply({
        success: true,
        escalated: true,
        messages: [
          {
            id: 3,
            role: 'agent',
            content: 'We refunded the order.',
            sentAt: '2026-01-02T10:00:00Z',
          },
        ],
        cursor: 3,
      });
    bootWidget({ collectUserInfo: true });
    await flush();
    await openChat();

    expect(localStorage.getItem(SESSION_KEY)).toBe('sess-old');
    expect(messageCalls()).toHaveLength(1);
    expect(messageCalls()[0].body).toEqual({ sessionKey: 'sess-old', after: 0 });
    expect(document.body.textContent).toContain('a member of our team will follow up by email');
    expect(document.body.textContent).toContain('We refunded the order.');
    // No "Connect with our team" button on a handed-off session.
    expect(document.querySelector('.odly-action-btn')).toBeNull();
  });

  it('drops a stale session that was never handed off (control)', async () => {
    localStorage.setItem(SESSION_KEY, 'sess-plain');
    bootWidget({ collectUserInfo: true });
    await flush();
    await openChat();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(messageCalls()).toHaveLength(0);
  });

  it('polls only while open and visible, one request at a time, and keeps the draft', async () => {
    storeHandoff();
    let release: ((value: FakeResponse) => void) | null = null;
    messagesResponder = () =>
      new Promise<FakeResponse>((resolve) => {
        release = resolve;
      });
    bootWidget();
    await flush();
    await openChat();
    expect(messageCalls()).toHaveLength(1);

    // Becoming visible again while a request is pending does not start a second one.
    setVisibility('hidden');
    setVisibility('visible');
    await flush(60000);
    expect(messageCalls()).toHaveLength(1);

    const draft = document.getElementById('odly-input') as HTMLTextAreaElement;
    draft.value = 'half-typed';
    (release as unknown as (value: FakeResponse) => void)(
      reply({
        success: true,
        escalated: true,
        messages: [{ id: 5, role: 'agent', content: 'New answer', sentAt: '2026-01-02T10:00:00Z' }],
        cursor: 5,
      })
    );
    await flush();
    expect(document.body.textContent).toContain('New answer');
    expect((document.getElementById('odly-input') as HTMLTextAreaElement).value).toBe('half-typed');

    messagesResponder = () => reply({ success: true, escalated: true, messages: [], cursor: 5 });
    setVisibility('hidden');
    await flush(60000);
    expect(messageCalls()).toHaveLength(1);

    setVisibility('visible');
    await flush();
    expect(messageCalls()).toHaveLength(2);

    (document.getElementById('odly-toggle') as HTMLButtonElement).click(); // close
    await flush(120000);
    expect(messageCalls()).toHaveLength(2);
  });

  it('stops quietly on a 404 until the next open and backs off on other errors', async () => {
    storeHandoff();
    messagesResponder = () => reply({ success: false, error: 'Not found' }, 404);
    bootWidget();
    await flush();
    await openChat();
    expect(messageCalls()).toHaveLength(1);
    await flush(120000);
    expect(messageCalls()).toHaveLength(1);
    expect(document.body.textContent).not.toContain('Not found');

    messagesResponder = () => reply({ success: false, error: 'Busy' }, 500);
    (document.getElementById('odly-toggle') as HTMLButtonElement).click(); // close
    await openChat(); // reopen retries
    expect(messageCalls()).toHaveLength(2);
    await flush(20000);
    expect(messageCalls()).toHaveLength(2); // backed off to 40 s
    await flush(20000);
    expect(messageCalls()).toHaveLength(3);
    expect(document.body.textContent).not.toContain('Busy');
  });

  // Review of #615: a 404, or a request still in flight, for an OLD session must not keep a new
  // handoff in the same open panel from polling.
  it('a new handoff after a 404 for the old session polls without reopening', async () => {
    storeHandoff();
    messagesResponder = (call) =>
      call.body?.sessionKey === 'sess-old'
        ? reply({ success: false, error: 'Session not found' }, 404)
        : reply({ success: true, escalated: true, messages: [], cursor: null });
    chatResponder = () =>
      reply({ success: true, reply: 'Passing you on.', sessionKey: 'sess-new', escalated: true });
    bootWidget();
    await flush();
    await openChat();
    expect(messageCalls()).toHaveLength(1);

    const input = document.getElementById('odly-input') as HTMLTextAreaElement;
    input.value = 'Still need help';
    (document.getElementById('odly-send') as HTMLButtonElement).click();
    await flush(20000);
    expect(messageCalls().map((call) => call.body?.sessionKey)).toEqual(['sess-old', 'sess-new']);
  });

  it('an answer for the old session arriving after a new handoff restarts polling', async () => {
    storeHandoff();
    let release: ((value: FakeResponse) => void) | null = null;
    messagesResponder = (call) =>
      call.body?.sessionKey === 'sess-old'
        ? new Promise<FakeResponse>((resolve) => {
            release = resolve;
          })
        : reply({ success: true, escalated: true, messages: [], cursor: null });
    chatResponder = () =>
      reply({ success: true, reply: 'Passing you on.', sessionKey: 'sess-new', escalated: true });
    bootWidget();
    await flush();
    await openChat();
    const input = document.getElementById('odly-input') as HTMLTextAreaElement;
    input.value = 'Still need help';
    (document.getElementById('odly-send') as HTMLButtonElement).click();
    await flush();
    (release as unknown as (value: FakeResponse) => void)(
      reply({
        success: true,
        escalated: true,
        messages: [{ id: 9, role: 'agent', content: 'Old answer', sentAt: '2026-01-02T10:00:00Z' }],
        cursor: 9,
      })
    );
    await flush(20000);
    expect(messageCalls().map((call) => call.body?.sessionKey)).toEqual(['sess-old', 'sess-new']);
    expect(document.body.textContent).not.toContain('Old answer');
  });

  it('a session that cannot be saved to storage is still handed off and polled', async () => {
    chatResponder = () =>
      reply({ success: true, reply: 'Passing you on.', sessionKey: 'sess-new', escalated: true });
    bootWidget();
    await flush();
    await openChat();
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      const input = document.getElementById('odly-input') as HTMLTextAreaElement;
      input.value = 'I want a person';
      (document.getElementById('odly-send') as HTMLButtonElement).click();
      await flush(20000);
    } finally {
      setItem.mockRestore();
    }
    expect(messageCalls().map((call) => call.body?.sessionKey)).toEqual(['sess-new']);
  });

  it('a reply arriving while the visitor types the code keeps the code field focused', async () => {
    chatResponder = (call) =>
      call.url.endsWith('/email-verification/send')
        ? reply({ status: 'sent', maskedEmail: 'v***@example.test' })
        : reply({
            success: true,
            reply: 'Passing you on.',
            sessionKey: 'sess-new',
            escalated: true,
            hasEmail: true,
            emailVerified: false,
          });
    messagesResponder = () =>
      reply({
        success: true,
        escalated: true,
        messages: [{ id: 4, role: 'agent', content: 'Hello', sentAt: '2026-01-02T10:00:00Z' }],
        cursor: 4,
      });
    bootWidget({ emailVerification: { available: true } });
    await flush();
    await openChat();
    const input = document.getElementById('odly-input') as HTMLTextAreaElement;
    input.value = 'I want a person';
    (document.getElementById('odly-send') as HTMLButtonElement).click();
    await flush();
    (document.querySelector('.odly-verify .odly-action-btn') as HTMLButtonElement).click();
    await flush();
    const code = document.querySelector<HTMLInputElement>('.odly-verify-input');
    expect(code).not.toBeNull();
    code?.focus();
    (code as HTMLInputElement).value = '123';
    await flush(20000);
    expect(document.body.textContent).toContain('Hello');
    const after = document.querySelector<HTMLInputElement>('.odly-verify-input');
    expect(after?.value).toBe('123');
    expect(document.activeElement).toBe(after);
  });
});
