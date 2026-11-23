/**
 * Two review fixes on the automatic-reply card (2026-11-23):
 * - a save refused as stale (409) is the ONE "Not saved": the saves already queued behind it were
 *   made on the same stale page and are dropped, not sent with the refused stamp;
 * - "Same as workspace" for a team switched on by its own override, while the workspace never
 *   chose what replies, is stored by the backend as keyword rules only: the pill says so, and the
 *   press asks nothing about the AI.
 * The real settings card on the shared stand-in backend; invented data.
 */
import { BILLING, TEAM, add, show, state } from './restrictedTopics.testkit';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { SAME_AS_WORKSPACE_NO_CHOICE } from '../AutoReplyConfiguration';

const STALE = 'These settings were changed by someone else. Reload and make the change again.';
const STAMP = '2026-11-23T09:00:00.000Z';
const NEWER = '2026-11-23T09:30:00.000Z';
const doseSwitch = () => screen.getByRole('switch', { name: 'Hold replies that state a dose' });
const TEAM_MODE = `What replies on its own for ${BILLING.name}`;
const team = () => within(screen.getByRole('group', { name: TEAM_MODE }));

describe('saves queued behind a save refused as stale (409)', () => {
  it('are not sent: one "Not saved", one re-read; a save after the re-read goes out', async () => {
    state.updatedAt = STAMP;
    show();
    await screen.findByRole('list', { name: TEAM });
    const held: (() => void)[] = [];
    state.held = held;
    // A team save goes out and waits…
    add(TEAM, 'contract changes');
    await waitFor(() => expect(state.updates).toHaveLength(1));
    // …and a workspace save is queued behind it, made on the same page.
    fireEvent.click(doseSwitch());
    // The waiting save is refused as stale (someone else saved); a save sent after it would be
    // refused too, and say "Not saved" a second time.
    state.held = null;
    state.failWith = { status: 409, response: { status: 409, data: { error: STALE } } };
    state.updatedAt = NEWER;
    held.forEach((release) => release());
    await waitFor(() =>
      expect(state.alerts.at(-1)).toMatchObject({ title: 'Not saved', description: STALE })
    );
    await waitFor(() => expect(doseSwitch()).not.toBeInactive());
    // The queued save was dropped, not sent with the stamp the server just refused.
    expect(state.updates).toHaveLength(1);
    expect(state.alerts.filter((alert) => alert.title === 'Not saved')).toHaveLength(1);
    // CONTROL: the page is current again, so the next save is sent, with the re-read's stamp.
    state.failWith = null;
    fireEvent.click(doseSwitch());
    await waitFor(() => expect(state.updates).toHaveLength(2));
    expect(state.updates[1]).toEqual({ doseRule: true, expectedUpdatedAt: NEWER });
  });
});

describe('"Same as workspace" for a team switched on while the workspace never chose', () => {
  it('says keyword rules only until the workspace chooses, and is saved without "Let the AI reply"', async () => {
    state.updatedAt = STAMP;
    state.modeStored = null;
    state.teams = { '7': { autoReplyEnabled: true, autoReplyMode: 'rules_only' } };
    show();
    await screen.findByRole('group', { name: TEAM_MODE });
    const same = team().getByRole('button', { name: SAME_AS_WORKSPACE_NO_CHOICE });
    expect(team().queryByRole('button', { name: /Keyword rules and AI replies\)/ })).toBeNull();
    fireEvent.click(same);
    await waitFor(() => expect(state.updates).toHaveLength(1));
    expect(state.updates[0]).toEqual({
      teamSettingsChange: { departmentId: 7, settings: { autoReplyMode: null } },
      expectedUpdatedAt: STAMP,
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('CONTROL: a workspace that chose "Keyword rules and AI replies" is named, and the press is confirmed', async () => {
    state.updatedAt = STAMP;
    state.modeStored = 'all';
    state.teams = { '7': { autoReplyEnabled: true, autoReplyMode: 'rules_only' } };
    show();
    await screen.findByRole('group', { name: TEAM_MODE });
    fireEvent.click(
      team().getByRole('button', { name: 'Same as workspace (Keyword rules and AI replies)' })
    );
    expect(await screen.findByRole('button', { name: 'Let the AI reply' })).toBeInTheDocument();
    expect(state.updates).toEqual([]);
  });
});
