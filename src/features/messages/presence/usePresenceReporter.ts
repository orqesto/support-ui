/**
 * This tab's presence state on the thread it shows (spec §5.1). Pure rules in
 * `computePresenceState`; the hook feeds them the composer, the page visibility and the last
 * pointer/key input, and re-checks once a second so time-based changes (idle, away) happen on
 * their own. usePresenceWatch sends what this returns.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { isBlankRichText } from '@/lib/stripHtml';
import { useAuthStore } from '@/stores/authStore';
import type { PresenceSettings, PresenceState } from './presence.types';

/** A tab hidden for longer than this is away (spec §5.1: "tab hidden > 60 s"). */
export const HIDDEN_AWAY_MS = 60_000;
/** How often the time-based rules are re-checked. */
export const PRESENCE_TICK_MS = 1_000;

export interface PresenceRuleInput {
  composerText: string;
  composerMode: 'reply' | 'note';
  /** When the agent last changed the composer's words (useComposerText); null = never / blank. */
  lastAgentEditAt: number | null;
  /** When the page became hidden; null while visible. */
  hiddenSince: number | null;
  /** The last pointer or key input in this tab. */
  lastInputAt: number;
  settings: Pick<PresenceSettings, 'writingIdleMs' | 'awayAfterMs'>;
}

/** Away wins over writing; writing needs words in the box AND a recent edit by the agent. */
export const computePresenceState = (input: PresenceRuleInput, now: number): PresenceState => {
  if (input.hiddenSince !== null && now - input.hiddenSince > HIDDEN_AWAY_MS) return 'away';
  if (now - input.lastInputAt > input.settings.awayAfterMs) return 'away';
  const writing =
    input.lastAgentEditAt !== null &&
    now - input.lastAgentEditAt <= input.settings.writingIdleMs &&
    !isBlankRichText(input.composerText);
  if (!writing) return 'viewing';
  return input.composerMode === 'note' ? 'writing_note' : 'writing_reply';
};

/** What a thread view passes so its tab reports a state. */
export interface PresenceReporterInput {
  composerText: string;
  composerMode: 'reply' | 'note';
  /** useComposerText's ref: read on every check, no re-render needed when it moves. */
  lastAgentEditAt: { readonly current: number | null };
}

/**
 * For a view with no composer of its own (the ticket view): it reports "viewing", or "away" by
 * the same tab rules, on every thread it watches.
 */
export const VIEWER_ONLY_REPORTER: PresenceReporterInput = Object.freeze({
  composerText: '',
  composerMode: 'reply' as const,
  lastAgentEditAt: Object.freeze({ current: null }),
});

/**
 * The state to report, or null when this tab reports nothing: no input (a list view), a global
 * admin (spec §5.1: never stored), or no settings yet (no watch ack).
 */
export const usePresenceReporter = (
  input: PresenceReporterInput | undefined,
  settings: PresenceSettings | null
): PresenceState | null => {
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const active = input !== undefined && settings !== null && !isAdmin;
  const [state, setState] = useState<PresenceState | null>(null);

  const inputRef = useRef(input);
  inputRef.current = input;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const hiddenSince = useRef<number | null>(null);
  const lastInputAt = useRef(Date.now());
  const computed = useRef<PresenceState | null>(null);

  const recompute = useCallback(() => {
    const current = inputRef.current;
    const tunables = settingsRef.current;
    if (!current || !tunables) return;
    const next = computePresenceState(
      {
        composerText: current.composerText,
        composerMode: current.composerMode,
        lastAgentEditAt: current.lastAgentEditAt.current,
        hiddenSince: hiddenSince.current,
        lastInputAt: lastInputAt.current,
        settings: tunables,
      },
      Date.now()
    );
    computed.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    if (!active) {
      computed.current = null;
      setState(null);
      return;
    }
    hiddenSince.current = document.visibilityState === 'hidden' ? Date.now() : null;
    lastInputAt.current = Date.now();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenSince.current ??= Date.now();
      else {
        hiddenSince.current = null;
        lastInputAt.current = Date.now();
      }
      recompute();
    };
    // Every key press lands here: only coming back from away changes the state at once.
    const onInput = () => {
      lastInputAt.current = Date.now();
      if (computed.current === 'away') recompute();
    };
    const options: AddEventListenerOptions = { passive: true };
    document.addEventListener('visibilitychange', onVisibility, options);
    document.addEventListener('pointerdown', onInput, options);
    document.addEventListener('keydown', onInput, options);
    const tick = setInterval(recompute, PRESENCE_TICK_MS);
    recompute();
    return () => {
      document.removeEventListener('visibilitychange', onVisibility, options);
      document.removeEventListener('pointerdown', onInput, options);
      document.removeEventListener('keydown', onInput, options);
      clearInterval(tick);
    };
  }, [active, recompute]);

  // The composer's words or mode changed (an edit stamps lastAgentEditAt in the same write).
  const composerText = input?.composerText;
  const composerMode = input?.composerMode;
  useEffect(() => {
    if (active) recompute();
  }, [active, composerText, composerMode, settings, recompute]);

  return active ? state : null;
};
