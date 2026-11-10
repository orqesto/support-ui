/** The thread composer's unsent text (useThreadUnsentDraft): its mode and AI provenance come back too. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAuthStore } from '@/stores/authStore';
import { resetUnsentDraftPruneForTests, unsentDraftKey } from '@/lib/unsentDrafts';
import type { User } from '@/types';
import { useRef, useState } from 'react';
import { emptyRecipientDraft, type RecipientDraft } from '../RecipientFields';
import { keyForPayload, type KeptSendKey } from '../messageDetail/sendKey';
import { useComposerText } from '../messageDetail/useComposerText';
import { useThreadUnsentDraft } from '../messageDetail/useThreadUnsentDraft';
import { computePresenceState } from '../../presence/usePresenceReporter';

const stored = (scope: string) => window.localStorage.getItem(unsentDraftKey(1, 5, scope)!);

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  resetUnsentDraftPruneForTests();
  useAuthStore.setState({
    user: { id: 1 } as User,
    isAuthenticated: true,
    selectedOrganizationId: 5,
  });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('thread composer', () => {
  const useThread = () => {
    const composerText = useComposerText();
    const [recipientDraft, setRecipientDraft] = useState<RecipientDraft>(emptyRecipientDraft);
    const sendKeyRef = useRef<KeptSendKey | null>(null);
    const [sendFailedError, setSendFailedError] = useState<string | null>(null);
    return {
      composerText,
      recipientDraft,
      setRecipientDraft,
      sendKeyRef,
      setSendFailedError,
      ...useThreadUnsentDraft({
        threadId: 42,
        composerText,
        recipientDraft,
        setRecipientDraft,
        sendKeyRef,
        sendFailedError,
        fileCount: 0,
      }),
    };
  };

  it('an internal note comes back as a note, never as a reply to the customer', () => {
    const first = renderHook(useThread);
    act(() => {
      first.result.current.composerText.setComposerMode('note');
    });
    act(() => first.result.current.composerText.writeComposer('<p>for the team only</p>'));
    first.unmount();

    const again = renderHook(useThread);
    expect(again.result.current.composerText.composer).toBe('<p>for the team only</p>');
    expect(again.result.current.composerText.composerMode).toBe('note');
    expect(again.result.current.restoredDraft).toBe(true);
  });

  it('a restored draft is viewing, not writing; typing after it is writing (presence)', () => {
    const settings = {
      enabled: true,
      heartbeatMs: 15_000,
      expiryMs: 45_000,
      writingIdleMs: 120_000,
      awayAfterMs: 300_000,
      listFlushMs: 2_000,
      ticketWatchCap: 50,
    };
    const stateOf = (box: ReturnType<typeof useThread>['composerText']) =>
      computePresenceState(
        {
          composerText: box.latestComposer.current,
          composerMode: box.composerMode,
          lastAgentEditAt: box.lastAgentEditAt.current,
          hiddenSince: null,
          lastInputAt: Date.now(),
          settings,
        },
        Date.now()
      );
    const first = renderHook(useThread);
    act(() => first.result.current.composerText.writeComposer('<p>kept</p>', 'reply'));
    first.unmount();

    const again = renderHook(useThread);
    expect(again.result.current.composerText.composer).toBe('<p>kept</p>');
    expect(stateOf(again.result.current.composerText)).toBe('viewing');
    act(() => again.result.current.composerText.writeComposer('<p>kept and more</p>'));
    expect(stateOf(again.result.current.composerText)).toBe('writing_reply');
  });

  it('a restored AI draft is still sent as AI-drafted', () => {
    const first = renderHook(useThread);
    act(() => {
      first.result.current.composerText.writeComposer('<p>AI wrote this</p>', 'reply');
      first.result.current.composerText.handleAiSourceChange('ai_draft', {
        text: '<p>AI wrote this</p>',
      });
    });
    first.unmount();

    const again = renderHook(useThread);
    expect(again.result.current.composerText.composerMode).toBe('reply');
    expect(again.result.current.composerText.aiSource).toBe('ai_draft');
    expect(again.result.current.composerText.aiDraft).toEqual({ text: '<p>AI wrote this</p>' });
  });

  it('Discard empties the composer and forgets the kept copy', () => {
    const first = renderHook(useThread);
    act(() => first.result.current.composerText.writeComposer('<p>never mind</p>', 'reply'));
    first.unmount();

    const again = renderHook(useThread);
    act(() => again.result.current.discardRestoredDraft());
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(again.result.current.composerText.composer).toBe('');
    expect(again.result.current.restoredDraft).toBe(false);
    expect(stored('thread:42')).toBeNull();
  });

  /*
    A reply whose send timed out may have reached the customer. Reloading brings the text back;
    pressing Send again must reuse the failed attempt's key so the BE drops the duplicate.
  */
  it('a failed reply’s send key comes back, so re-sending the same email dedups', () => {
    const payload = JSON.stringify(['<p>Your refund is on its way</p>', [], [], [], []]);
    const first = renderHook(useThread);
    act(() =>
      first.result.current.composerText.writeComposer('<p>Your refund is on its way</p>', 'reply')
    );
    // The send: a key minted for this payload, then a timeout.
    const failedKey = keyForPayload(first.result.current.sendKeyRef, payload);
    act(() => first.result.current.setSendFailedError('timeout'));
    first.unmount();

    const again = renderHook(useThread);
    expect(again.result.current.composerText.composer).toBe('<p>Your refund is on its way</p>');
    expect(keyForPayload(again.result.current.sendKeyRef, payload)).toBe(failedKey);
    // Control: a different email still gets its own key.
    expect(keyForPayload(again.result.current.sendKeyRef, payload + 'x')).not.toBe(failedKey);
  });

  it('recipients the agent added come back with the reply', () => {
    const first = renderHook(useThread);
    act(() => {
      first.result.current.composerText.writeComposer('<p>See below</p>', 'reply');
      first.result.current.setRecipientDraft({ to: '', cc: 'billing@example.com', bcc: '' });
    });
    first.unmount();

    const again = renderHook(useThread);
    expect(again.result.current.recipientDraft.cc).toBe('billing@example.com');
  });

  it('a reply sent after the agent left the thread does not come back', () => {
    const first = renderHook(useThread);
    act(() => first.result.current.composerText.writeComposer('<p>Sent already</p>', 'reply'));
    keyForPayload(first.result.current.sendKeyRef, 'payload');
    const send = first.result.current.beginDraftSend();
    first.unmount(); // J/K mid-send
    send.settle(true);
    const again = renderHook(useThread);
    expect(again.result.current.composerText.composer).toBe('');
    expect(again.result.current.restoredDraft).toBe(false);
  });

  it('a reply that failed after the agent left comes back WITH its send key', () => {
    const first = renderHook(useThread);
    act(() => first.result.current.composerText.writeComposer('<p>Timed out</p>', 'reply'));
    const failedKey = keyForPayload(first.result.current.sendKeyRef, 'payload');
    const send = first.result.current.beginDraftSend();
    first.unmount();
    send.settle(false);
    const again = renderHook(useThread);
    expect(again.result.current.composerText.composer).toBe('<p>Timed out</p>');
    expect(keyForPayload(again.result.current.sendKeyRef, 'payload')).toBe(failedKey);
  });

  it('the restored notice counts the files that must be attached again', () => {
    const first = renderHook(() => {
      const composerText = useComposerText();
      const [recipientDraft, setRecipientDraft] = useState<RecipientDraft>(emptyRecipientDraft);
      const sendKeyRef = useRef<KeptSendKey | null>(null);
      return (
        useThreadUnsentDraft({
          threadId: 42,
          composerText,
          recipientDraft,
          setRecipientDraft,
          sendKeyRef,
          sendFailedError: null,
          fileCount: 2,
        }) && composerText
      );
    });
    act(() => first.result.current.writeComposer('<p>See attached</p>', 'reply'));
    first.unmount();
    expect(renderHook(useThread).result.current.restoredFiles).toBe(2);
  });
});
