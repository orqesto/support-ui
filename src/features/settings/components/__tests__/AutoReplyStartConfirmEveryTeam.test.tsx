/**
 * The confirmation names the mailboxes of the WHOLE workspace, whatever team is selected in the
 * header: with a team selected, every other request carries `X-Department-Context` and the
 * backend answers with that team's mailboxes only — the dialog would leave the rest out. Seen at
 * the HTTP client: the real dialog, the real service and the real request interceptor; only the
 * transport is replaced.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { AxiosAdapter } from 'axios';
import { apiClient } from '@/lib/api-client';
import { integrationsService } from '@/services/integrations.service';
import { useAuthStore } from '@/stores/authStore';
import { useDepartmentContextStore } from '@/stores/departmentContextStore';
import type { User } from '@/types';
import { AutoReplyStartConfirm } from '../AutoReplyStartConfirm';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const seen: Array<{ url: string; department: unknown; marker: unknown }> = [];
const transport: AxiosAdapter = (config) => {
  const headers = config.headers as unknown as Record<string, unknown>;
  seen.push({
    url: config.url ?? '',
    department: headers['X-Department-Context'],
    marker: headers['X-Every-Team'],
  });
  const data = config.url?.endsWith('/departments')
    ? []
    : [
        {
          id: 1,
          type: 'email',
          enabled: true,
          name: 'Help',
          config: { user: 'help@shop.example' },
        },
      ];
  return Promise.resolve({
    data: { success: true, data },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  });
};
const realAdapter = apiClient.defaults.adapter;

beforeEach(() => {
  seen.length = 0;
  apiClient.defaults.adapter = transport;
  useAuthStore.setState({
    selectedOrganizationId: 5,
    user: { id: 1, email: 'a@shop.example', firstName: 'A', role: 'user' } as User,
  });
  // A team is selected in the header.
  useDepartmentContextStore.getState().setSelected([7]);
});
afterEach(() => {
  cleanup();
  apiClient.defaults.adapter = realAdapter;
  useDepartmentContextStore.getState().setSelected([]);
});

describe('the mailboxes the confirmation names', () => {
  it('are asked for without the selected team’s filter, and the opt-out never leaves the browser', async () => {
    render(
      <AutoReplyStartConfirm
        start={{ kind: 'first', mode: 'rules_only' }}
        teamIsOff={() => false}
        teamsWithAi={[]}
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );
    expect(await screen.findByText('help@shop.example')).toBeInTheDocument();
    expect(seen.map((request) => request.url)).toEqual([
      '/api/integrations',
      '/api/integrations/1/departments',
    ]);
    for (const request of seen) {
      expect(request.department).toBeUndefined();
      expect(request.marker).toBeUndefined();
    }
  });

  it('CONTROL: the same list asked for the usual way does carry the selected team', async () => {
    await integrationsService.getAll();
    expect(seen).toEqual([{ url: '/api/integrations', department: '7', marker: undefined }]);
  });
});
