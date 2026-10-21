import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Settings and the AI flags (2026-10-21): the missing-info switch shows the REAL value now that
 * GET /auto-reply returns it, and Lead qualification warns about opted-in departments that were
 * deleted. Runs the real organization.service over a fake apiClient, so the fallbacks under test
 * are the shipped ones.
 */

const api = vi.hoisted(() => ({
  autoReply: {} as Record<string, unknown>,
  leadConfig: {} as Record<string, unknown>,
  patches: [] as { url: string; body: unknown }[],
}));
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (url: string) => {
      if (url === '/api/organizations/auto-reply')
        return Promise.resolve({ data: { success: true, data: api.autoReply } });
      if (url === '/api/organizations/lead-config')
        return Promise.resolve({ data: { success: true, data: api.leadConfig } });
      return Promise.resolve({ data: { success: true, data: { id: 1, settings: {} } } });
    },
    patch: (url: string, body: unknown) => {
      api.patches.push({ url, body });
      return Promise.resolve({ data: { success: true, data: body } });
    },
  },
}));
vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [{ id: 57, slug: 'sales', name: 'Sales', active: true }] }),
}));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ isOrgAdmin: true }) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

const { organizationService } = await import('@/services/organization.service');
const { AutoReplyConfiguration } = await import('../AutoReplyConfiguration');
const { LeadQualificationSettings } = await import('../LeadQualificationSettings');

beforeEach(() => {
  api.patches = [];
});

describe('getAutoReply — requestMissingInfo', () => {
  it('false from the API stays false', async () => {
    api.autoReply = { enabled: true, requestMissingInfo: false };
    expect((await organizationService.getAutoReply()).requestMissingInfo).toBe(false);
  });

  it('CONTROL — absent (older backend): the old default, true', async () => {
    api.autoReply = { enabled: true };
    expect((await organizationService.getAutoReply()).requestMissingInfo).toBe(true);
  });
});

const missingInfoSwitch = async () => {
  const row = (await screen.findByText('Request missing info')).closest('div')
    ?.parentElement as HTMLElement;
  return row.querySelector('[role="switch"]') as HTMLElement;
};

describe('the "Request missing info" switch', () => {
  it('shows OFF when the API says false', async () => {
    api.autoReply = { enabled: true, requestMissingInfo: false };
    render(<AutoReplyConfiguration onShowAlert={() => {}} />);
    expect(await missingInfoSwitch()).toHaveAttribute('aria-checked', 'false');
  });

  it('CONTROL — field absent: ON, as before', async () => {
    api.autoReply = { enabled: true };
    render(<AutoReplyConfiguration onShowAlert={() => {}} />);
    expect(await missingInfoSwitch()).toHaveAttribute('aria-checked', 'true');
  });
});

const renderLeadSettings = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LeadQualificationSettings />
    </QueryClientProvider>
  );

const leadBase = {
  departments: [57, 68],
  requiredContactFields: ['name', 'email'],
  autoMarkNewSenders: false,
  qualificationFields: [],
  categories: [],
};

describe('Lead qualification — deleted opted-in departments', () => {
  it('lists the missing ids', async () => {
    api.leadConfig = { ...leadBase, configured: true, missingDepartmentIds: [68, 70] };
    renderLeadSettings();
    const warning = await screen.findByTestId('lead-missing-departments');
    expect(warning).toHaveTextContent(/were deleted/);
    expect(warning).toHaveTextContent('#68, #70');
  });

  it.each([
    ['empty', { missingDepartmentIds: [] }],
    ['absent (older backend)', {}],
  ])('CONTROL — %s: no warning', async (_label, extra) => {
    api.leadConfig = { ...leadBase, ...extra };
    renderLeadSettings();
    await screen.findByText('Lead Qualification');
    expect(screen.queryByTestId('lead-missing-departments')).toBeNull();
  });

  it('never sends the computed fields back on save', async () => {
    await organizationService.updateLeadConfig({
      ...leadBase,
      configured: false,
      missingDepartmentIds: [68],
    } as never);
    await waitFor(() => expect(api.patches).toHaveLength(1));
    const body = api.patches[0].body as Record<string, unknown>;
    expect(body).not.toHaveProperty('configured');
    expect(body).not.toHaveProperty('missingDepartmentIds');
    // 68 is gone and the page cannot show it: it is not sent back to be re-stored.
    expect(body.departments).toEqual([57]);
  });

  it('CONTROL: with nothing missing every opted-in department is sent', async () => {
    await organizationService.updateLeadConfig({
      ...leadBase,
      configured: true,
      missingDepartmentIds: [],
    } as never);
    await waitFor(() => expect(api.patches).toHaveLength(1));
    expect((api.patches[0].body as Record<string, unknown>).departments).toEqual([57, 68]);
  });
});
