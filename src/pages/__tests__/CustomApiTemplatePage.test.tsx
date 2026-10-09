/**
 * Start a connection's lookups from a custom API template (spec CUSTOM-API-TEMPLATES).
 * The guide itself is TemplateGuide's test; this pins the page: what it lists, the empty state,
 * and that the tab's MANAGE_INTEGRATIONS gate is repeated for a typed URL.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CustomApiTemplatePage } from '../CustomApiTemplatePage';
import { CUSTOM_API_TEMPLATE_ROUTE } from '@/components/settings/customApi/lookupPaths';
import type * as Svc from '@/services/customApi.service';
import type { CustomApiTemplate } from '@/services/customApiTemplates.service';

type Connection = Svc.CustomApiConnection;

const list = vi.fn<() => Promise<Connection[]>>();
const listPublished = vi.fn<() => Promise<CustomApiTemplate[]>>();
let allowed = true;

vi.mock('@/services/customApi.service', async () => {
  const actual = await vi.importActual<typeof Svc>('@/services/customApi.service');
  return {
    ...actual,
    customApiService: { ...actual.customApiService, list: () => list() },
  };
});
vi.mock('@/services/customApiTemplates.service', () => ({
  customApiTemplateService: { listPublished: () => listPublished() },
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => allowed }),
}));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../../components/settings/customApi/TemplateGuide', () => ({
  TemplateGuide: ({ template }: { template: CustomApiTemplate }) => (
    <p>guide for {template.name}</p>
  ),
}));

const connection = { id: 9, name: 'Militech', endpoints: [] } as unknown as Connection;
const template = {
  id: 1,
  key: 'order_tracking',
  name: 'Order tracking',
  description: 'Orders and their status for the customer on the thread.',
  status: 'published',
  updatedAt: '',
  definition: { version: 1, lookups: [] },
} as unknown as CustomApiTemplate;

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={CUSTOM_API_TEMPLATE_ROUTE} element={<CustomApiTemplatePage />} />
        <Route path="/settings" element={<p>Settings list</p>} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  allowed = true;
  list.mockReset().mockResolvedValue([connection]);
  listPublished.mockReset().mockResolvedValue([template]);
});

describe('the custom API template page', () => {
  it('lists the published templates and opens the guide for the one chosen', async () => {
    renderAt('/settings/custom-apis/9/templates');

    expect(await screen.findByText('Order tracking')).toBeTruthy();
    expect(
      screen.getByText('Orders and their status for the customer on the thread.')
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Use this template' }));
    expect(screen.getByText('guide for Order tracking')).toBeTruthy();
  });

  it('says so when no template is published', async () => {
    listPublished.mockResolvedValue([]);
    renderAt('/settings/custom-apis/9/templates');

    expect(await screen.findByText('No templates are published yet.')).toBeTruthy();
  });

  it('⛔ repeats the tab’s MANAGE_INTEGRATIONS gate: a typed URL is not a way in', async () => {
    allowed = false;
    renderAt('/settings/custom-apis/9/templates');

    expect(
      await screen.findByText(
        'You need permission to manage integrations to edit lookups. Ask a workspace admin.'
      )
    ).toBeTruthy();
    expect(listPublished).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });
});
