/**
 * The workspace's AI options ("Request missing info", "Suggest solutions" and the confidence under
 * it) are what every team inherits — a team switched on by its own override included. They were
 * shown only while the workspace default was on, so with the default off and one team on, an
 * admin could neither see nor change what that team used. The real settings card on the shared
 * stand-in backend; invented data.
 */
import { BILLING, show, state } from './restrictedTopics.testkit';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';

const BY_DEFAULT_OFF = /Automatic replies are off by default but on for at least one team/;

describe('workspace AI options under the default switched off', () => {
  it('one team overridden on: "Suggest solutions" and "Request missing info" are shown, said to be inherited', async () => {
    state.orgEnabled = false;
    state.teams = { [String(BILLING.id)]: { autoReplyEnabled: true } };
    show();
    expect(await screen.findByText('Suggest solutions')).toBeTruthy();
    expect(screen.getByText('Request missing info')).toBeTruthy();
    expect(screen.getByText(BY_DEFAULT_OFF)).toBeTruthy();
  });

  it('CONTROL: nothing on anywhere — the options stay hidden', async () => {
    state.orgEnabled = false;
    state.teams = {};
    show();
    await screen.findAllByText('Automatic email replies');
    expect(screen.queryByText('Suggest solutions')).toBeNull();
    expect(screen.queryByText(BY_DEFAULT_OFF)).toBeNull();
  });

  it('CONTROL: the default on — shown as before, without the inherited note', async () => {
    show();
    expect(await screen.findByText('Suggest solutions')).toBeTruthy();
    expect(screen.queryByText(BY_DEFAULT_OFF)).toBeNull();
  });
});
