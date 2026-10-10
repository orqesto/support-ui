/**
 * Start a connection's lookups from a custom API template (spec CUSTOM-API-TEMPLATES).
 * The guide itself is TemplateGuide's test; this pins the page: what it lists, the empty state,
 * and that the tab's MANAGE_INTEGRATIONS gate is repeated for a typed URL.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
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
  TemplateGuide: ({
    template,
    onCancel,
    onDone,
  }: {
    template: CustomApiTemplate;
    onCancel: (notice?: string) => void;
    onDone: (notice?: string) => void;
  }) => (
    <div>
      <p>guide for {template.name}</p>
      <button onClick={() => onCancel()}>cancel quietly</button>
      <button onClick={() => onCancel('Step 1 was saved as “A”. Step 2 was not added.')}>
        cancel part-way
      </button>
      <button onClick={() => onDone('Step 2 was not added.')}>done part-way</button>
    </div>
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

const SettingsStub = () => {
  const state = useLocation().state as { customApiNotice?: string } | null;
  return <p>Settings list. Notice: {state?.customApiNotice ?? 'none'}</p>;
};

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={CUSTOM_API_TEMPLATE_ROUTE} element={<CustomApiTemplatePage />} />
        <Route path="/settings" element={<SettingsStub />} />
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

  it('F4: Cancel with nothing kept goes back to the template list', async () => {
    renderAt('/settings/custom-apis/9/templates');
    await userEvent.click(await screen.findByRole('button', { name: 'Use this template' }));
    await userEvent.click(screen.getByRole('button', { name: 'cancel quietly' }));
    expect(screen.getByRole('button', { name: 'Use this template' })).toBeTruthy();
  });

  it('⛔ F4: Cancel part-way goes back to the lookups WITH the notice', async () => {
    renderAt('/settings/custom-apis/9/templates');
    await userEvent.click(await screen.findByRole('button', { name: 'Use this template' }));
    await userEvent.click(screen.getByRole('button', { name: 'cancel part-way' }));
    expect(
      screen.getByText('Settings list. Notice: Step 1 was saved as “A”. Step 2 was not added.')
    ).toBeTruthy();
  });

  it('F4: finishing part-way carries the notice too', async () => {
    renderAt('/settings/custom-apis/9/templates');
    await userEvent.click(await screen.findByRole('button', { name: 'Use this template' }));
    await userEvent.click(screen.getByRole('button', { name: 'done part-way' }));
    expect(screen.getByText('Settings list. Notice: Step 2 was not added.')).toBeTruthy();
  });
});
