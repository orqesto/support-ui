/** Budgets service over the REAL api-client (only the wire is fake): path, verb, query and body of every route. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { installTransport, ok, routeAbsent, type WireHandler } from '@/test/apiTransport';
import { budgetsService } from '@/services/budgets.service';

let handler: WireHandler = routeAbsent;
let wire: ReturnType<typeof installTransport>;
beforeEach(() => {
  handler = () => ok({ marker: true });
  wire = installTransport(apiClient, (request) => handler(request));
});
afterEach(() => wire.restore());

const last = () => wire.requests[wire.requests.length - 1];

describe('budgetsService - platform', () => {
  it('getState reads /state and unwraps data', async () => {
    handler = () => ok({ active: false });
    expect(await budgetsService.getState()).toEqual({ available: true, state: { active: false } });
    expect(last()).toMatchObject({ method: 'GET', path: '/api/admin/budgets/state' });
  });

  it('getState: 404 (FE deployed before BE) is { available: false }, not an error', async () => {
    handler = routeAbsent;
    expect(await budgetsService.getState()).toEqual({ available: false });
  });

  it('getState: a 500 is an error', async () => {
    handler = () => ({ status: 500, data: { success: false, error: 'boom' } });
    await expect(budgetsService.getState()).rejects.toBeTruthy();
  });

  it('getMigration / applyMigration', async () => {
    await budgetsService.getMigration();
    expect(last()).toMatchObject({ method: 'GET', path: '/api/admin/budgets/migration' });
    await budgetsService.applyMigration({ 'a:1': { budget: 5, bulkPct: 70 } });
    expect(last()).toMatchObject({
      method: 'POST',
      path: '/api/admin/budgets/migration/apply',
      body: { overrides: { 'a:1': { budget: 5, bulkPct: 70 } } },
    });
    await budgetsService.applyMigration();
    expect(last().body).toEqual({});
  });

  it('listGroups sends q, sort, filter, page, pageSize', async () => {
    await budgetsService.listGroups({
      q: 'acme',
      sort: 'name',
      filter: 'paused',
      page: 2,
      pageSize: 25,
    });
    expect(last()).toMatchObject({
      method: 'GET',
      path: '/api/admin/budgets/groups',
      params: { q: 'acme', sort: 'name', filter: 'paused', page: '2', pageSize: '25' },
    });
  });

  it('getGroup / updateGroup encode the key', async () => {
    await budgetsService.getGroup('a:7');
    expect(last()).toMatchObject({ method: 'GET', path: '/api/admin/budgets/groups/a%3A7' });
    await budgetsService.updateGroup('w:9', { budget: null, bulkLimitOn: true, bulkPct: 60 });
    expect(last()).toMatchObject({
      method: 'PUT',
      path: '/api/admin/budgets/groups/w%3A9',
      body: { budget: null, bulkLimitOn: true, bulkPct: 60 },
    });
  });

  it('setWorkspaceLimits, giveExtra, endExtra, declineRequest, updateSettings', async () => {
    await budgetsService.setWorkspaceLimits([1, 2], null);
    expect(last()).toMatchObject({
      method: 'PUT',
      path: '/api/admin/budgets/workspace-limits',
      body: { organizationIds: [1, 2], limit: null },
    });
    const body = {
      targets: [{ allianceId: 3, organizationId: null }],
      tokens: 'suggested' as const,
      end: 7 as const,
      requestId: 4,
      reason: 'x',
    };
    await budgetsService.giveExtra(body);
    expect(last()).toMatchObject({ method: 'POST', path: '/api/admin/budgets/extra', body });
    await budgetsService.endExtra([5, 6]);
    expect(last()).toMatchObject({
      method: 'POST',
      path: '/api/admin/budgets/extra/end',
      body: { grantIds: [5, 6] },
    });
    await budgetsService.declineRequest(12);
    expect(last()).toMatchObject({
      method: 'POST',
      path: '/api/admin/budgets/requests/12/decline',
    });
    await budgetsService.updateSettings({ bulkPctMax: 80, serverCeiling: null });
    expect(last()).toMatchObject({
      method: 'PATCH',
      path: '/api/admin/budgets/settings',
      body: { bulkPctMax: 80, serverCeiling: null },
    });
  });
});

describe('budgetsService - organisation and workspace', () => {
  it('alliance routes', async () => {
    await budgetsService.getAllianceBudget(4);
    expect(last()).toMatchObject({ method: 'GET', path: '/api/alliances/4/budget' });
    await budgetsService.updateAllianceBudget(4, { bulkPct: 55 });
    expect(last()).toMatchObject({
      method: 'PUT',
      path: '/api/alliances/4/budget',
      body: { bulkPct: 55 },
    });
    await budgetsService.setAllianceWorkspaceLimits(4, [8], 1000);
    expect(last()).toMatchObject({
      method: 'PUT',
      path: '/api/alliances/4/budget/workspace-limits',
      body: { organizationIds: [8], limit: 1000 },
    });
    await budgetsService.requestAllianceExtra(4, { organizationId: 8, tokens: 500, reason: 'r' });
    expect(last()).toMatchObject({
      method: 'POST',
      path: '/api/alliances/4/budget/requests',
      body: { organizationId: 8, tokens: 500, reason: 'r' },
    });
  });

  it('workspace routes, and no context header is added by hand', async () => {
    await budgetsService.getMyAiUsage();
    expect(last()).toMatchObject({ method: 'GET', path: '/api/organizations/ai-usage' });
    await budgetsService.updateMyBudget({ budget: 9 });
    expect(last()).toMatchObject({
      method: 'PUT',
      path: '/api/organizations/ai-usage',
      body: { budget: 9 },
    });
    await budgetsService.requestMyExtra({ tokens: 100 });
    expect(last()).toMatchObject({
      method: 'POST',
      path: '/api/organizations/ai-usage/requests',
      body: { tokens: 100 },
    });
  });

  /*
   * Before the BE is tagged, GET /api/organizations/ai-usage falls through to the OLD server's
   * `GET /api/organizations/:id` (requireGlobalAdmin, then getById). Its exact answers:
   */
  const oldMember = {
    status: 403,
    data: { success: false, error: 'Global admin access required', code: 'ROLE_REQUIRED' },
  };
  const oldGlobalAdmin = {
    status: 400,
    data: { success: false, error: 'Invalid organization ID' },
  };

  it('old server, a member (403 ROLE_REQUIRED): budgets not available, not an error', async () => {
    handler = () => oldMember;
    expect(await budgetsService.getMyAiUsage()).toEqual({ active: false });
  });

  it('old server, the platform admin (400 Invalid organization ID): not available', async () => {
    handler = () => oldGlobalAdmin;
    expect(await budgetsService.getMyAiUsage()).toEqual({ active: false });
  });

  it('a server without the route (404): not available', async () => {
    handler = routeAbsent;
    expect(await budgetsService.getMyAiUsage()).toEqual({ active: false });
  });

  it("the NEW server's own 403 / 400 stay errors", async () => {
    handler = () => ({
      status: 403,
      data: {
        success: false,
        error: 'Insufficient permissions. Required: view_messages',
        code: 'PERMISSION_DENIED',
      },
    });
    await expect(budgetsService.getMyAiUsage()).rejects.toBeTruthy();
    handler = () => ({
      status: 403,
      data: { success: false, error: 'You do not have access to this workspace' },
    });
    await expect(budgetsService.getMyAiUsage()).rejects.toBeTruthy();
    handler = () => ({
      status: 400,
      data: { success: false, error: 'Workspace context required. Please select a workspace.' },
    });
    await expect(budgetsService.getMyAiUsage()).rejects.toBeTruthy();
    handler = () => ({ status: 500, data: { success: false, error: 'boom' } });
    await expect(budgetsService.getMyAiUsage()).rejects.toBeTruthy();
  });
});
