/**
 * Version skew (FE can reach prod before the BE): the Slack services tolerate both shapes of the
 * connection (with and without `teamId`, round 2) and of the platform settings (with and without
 * `postRetention`). The cards are keyed on `slackTeamKey`: the team id when sent, else the name.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import {
  platformSlackAlertsService,
  slackNotificationsService,
  slackTeamKey,
} from '@/services/slackNotifications.service';

const answer = (data: unknown) => ({ data: { success: true, data } }) as never;

afterEach(() => vi.restoreAllMocks());

describe('workspace Slack status', () => {
  it('keeps the team id the new backend sends', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(
      answer({
        connection: {
          teamId: 'T1',
          teamName: 'Example Co',
          status: 'connected',
          brokenReason: null,
        },
        routes: [],
      })
    );
    const status = await slackNotificationsService.getStatus();
    expect(status.connection?.teamId).toBe('T1');
    expect(slackTeamKey(status.connection)).toBe('T1');
  });

  it('an older backend (no team id) falls back to the team name', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(
      answer({
        connection: { teamName: 'Example Co', status: 'connected', brokenReason: null },
        routes: [],
      })
    );
    const status = await slackNotificationsService.getStatus();
    expect(status.connection?.teamId).toBeUndefined();
    expect(slackTeamKey(status.connection)).toBe('Example Co');
  });

  it('a pasted token answer is normalised the same way', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue(
      answer({ connection: { teamId: 7, teamName: 'Example Co', status: 'connected' } })
    );
    const connection = await slackNotificationsService.connectWithToken('xoxb-1');
    // A non-string id is not trusted as a key.
    expect(connection?.teamId).toBeUndefined();
    expect(connection?.brokenReason).toBeNull();
  });

  it('no connection keys as none', () => {
    expect(slackTeamKey(null)).toBe('none');
  });
});

describe('platform Slack status', () => {
  const platform = (over: Record<string, unknown>, connection: Record<string, unknown> | null) =>
    answer({
      connection,
      settings: { enabledSignals: [], thresholds: {}, ...over },
    });

  it('keeps the team id and the post retention the new backend sends', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(
      platform(
        { postRetention: { days: 45, chunkSize: 200, maxChunksPerWorkspace: 5 } },
        { teamId: 'T9', teamName: 'Ops', status: 'connected', source: 'db' }
      )
    );
    const status = await platformSlackAlertsService.getStatus();
    expect(slackTeamKey(status.connection)).toBe('T9');
    expect(status.settings.postRetention).toEqual({
      days: 45,
      chunkSize: 200,
      maxChunksPerWorkspace: 5,
    });
  });

  it('an older backend: no team id (name key) and no post retention (undefined)', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(
      platform({}, { teamName: 'Ops', status: 'connected', source: 'db' })
    );
    const status = await platformSlackAlertsService.getStatus();
    expect(slackTeamKey(status.connection)).toBe('Ops');
    expect(status.settings.postRetention).toBeUndefined();
  });

  it('a partial post retention is filled with the backend defaults', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(platform({ postRetention: { days: 90 } }, null));
    const status = await platformSlackAlertsService.getStatus();
    expect(status.settings.postRetention).toEqual({
      days: 90,
      chunkSize: 500,
      maxChunksPerWorkspace: 20,
    });
  });
});
