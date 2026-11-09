/**
 * Platform Defaults → Skill routing patterns (BE 2026-11-09): the three pattern caps (saved with
 * PATCH /settings/routing, only the changed ones, ranges enforced) and the preset catalogue
 * editor (PUT /skill-pattern-presets, the backend's refusal reason shown). An older backend: each
 * half says it is not there yet, without hiding the other.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const patches: { url: string; body: unknown }[] = [];
const puts: { url: string; body: unknown }[] = [];
let catalogueReply: () => Promise<unknown>;
let putReply: (body: unknown) => Promise<unknown>;
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    patch: (url: string, body: unknown) => {
      patches.push({ url, body });
      return Promise.resolve({ data: { success: true } });
    },
    get: () => catalogueReply(),
    put: (url: string, body: unknown) => {
      puts.push({ url, body });
      return putReply(body);
    },
  },
}));
vi.mock('@/lib/toast', () => ({
  toast: { failure: () => undefined, success: () => undefined },
}));

const { SkillPatternsCard } = await import('../SkillPatternsCard');
const { SKILL_PATTERN_CAP_SPECS } = await import('@/services/routingSettings');

const wrap = (node: ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>
  );

const CAPS = {
  skillPatternsPerValue: { value: 10, source: 'default' as const },
  skillPatternsPerWorkspace: { value: 50, source: 'default' as const },
  skillCustomPatternsPerWorkspace: { value: 20, source: 'db' as const },
};
const ROW = {
  id: 'order_number',
  label: 'Order number',
  example: 'ORD-123456',
  category: 'shop',
  regex: 'ORD-\\d{6}',
  caseSensitive: false,
  enabled: true,
};
const ok = (data: unknown) => Promise.resolve({ data: { success: true, data } });
const capInput = (name: keyof typeof CAPS) =>
  screen.getByLabelText<HTMLInputElement>(SKILL_PATTERN_CAP_SPECS[name].label);
const saveCatalogue = () => screen.getByRole('button', { name: 'Save catalogue' });

beforeEach(() => {
  patches.length = 0;
  puts.length = 0;
  catalogueReply = () => ok({ presets: [ROW], isDefault: true });
  putReply = (body) => ok({ ...(body as object), isDefault: false });
});
afterEach(cleanup);

describe('SkillPatternsCard — caps', () => {
  it('shows the three caps and saves only the changed one through PATCH /settings/routing', async () => {
    wrap(<SkillPatternsCard caps={CAPS} />);
    expect(capInput('skillPatternsPerValue').value).toBe('10');
    expect(capInput('skillCustomPatternsPerWorkspace').value).toBe('20');
    const save = screen.getByRole('button', { name: 'Save pattern limits' });
    expect(save).toBeInactive();
    fireEvent.change(capInput('skillPatternsPerValue'), { target: { value: '15' } });
    fireEvent.click(save);
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({
      url: '/api/admin/platform/settings/routing',
      body: { skillPatternsPerValue: 15 },
    });
  });

  it('refuses values outside the backend ranges; 0 own regexes is allowed', () => {
    wrap(<SkillPatternsCard caps={CAPS} />);
    const save = screen.getByRole('button', { name: 'Save pattern limits' });
    const cases: [keyof typeof CAPS, string][] = [
      ['skillPatternsPerValue', '0'],
      ['skillPatternsPerValue', '51'],
      ['skillPatternsPerWorkspace', '501'],
      ['skillCustomPatternsPerWorkspace', '201'],
      ['skillCustomPatternsPerWorkspace', '1.5'],
    ];
    for (const [name, bad] of cases) {
      fireEvent.change(capInput(name), { target: { value: bad } });
      expect(save, `${name}=${bad}`).toBeInactive();
      fireEvent.change(capInput(name), { target: { value: String(CAPS[name].value) } });
    }
    fireEvent.change(capInput('skillCustomPatternsPerWorkspace'), { target: { value: '0' } });
    expect(save).not.toBeInactive();
  });

  it('an older backend without the caps says so, and the catalogue still shows', async () => {
    wrap(<SkillPatternsCard caps={undefined} />);
    expect(screen.getByText(/arrive with the next backend release/)).toBeInTheDocument();
    expect(await screen.findByDisplayValue('order_number')).toBeInTheDocument();
  });
});

describe('SkillPatternsCard — catalogue', () => {
  it('lists the rows with "Built-in defaults"; a saved id is read-only', async () => {
    wrap(<SkillPatternsCard caps={CAPS} />);
    const id = await screen.findByLabelText<HTMLInputElement>('Id of order_number');
    expect(id).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Regular expression of order_number')).toHaveValue('ORD-\\d{6}');
    expect(screen.getByText('Built-in defaults')).toBeInTheDocument();
    expect(saveCatalogue()).toBeInactive();
  });

  it('add a row, edit, toggle case/enabled, delete another, Save — sends the list and shows it saved', async () => {
    wrap(<SkillPatternsCard caps={CAPS} />);
    await screen.findByLabelText('Id of order_number');
    fireEvent.click(screen.getByRole('switch', { name: 'Enabled order_number' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add pattern' }));
    const newId = screen.getByLabelText<HTMLInputElement>('Id of new pattern 2');
    expect(newId).not.toHaveAttribute('readonly');
    fireEvent.change(newId, { target: { value: 'ticket_ref' } });
    fireEvent.change(screen.getByLabelText('Label of ticket_ref'), {
      target: { value: 'Ticket ref' },
    });
    fireEvent.change(screen.getByLabelText('Category of ticket_ref'), {
      target: { value: 'support' },
    });
    fireEvent.change(screen.getByLabelText('Regular expression of ticket_ref'), {
      target: { value: 'TK-\\d+' },
    });
    fireEvent.click(screen.getByLabelText('Case-sensitive ticket_ref'));
    expect(screen.queryByText('Built-in defaults')).not.toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

    fireEvent.click(saveCatalogue());
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      url: '/api/admin/platform/skill-pattern-presets',
      body: {
        presets: [
          { ...ROW, enabled: false },
          {
            id: 'ticket_ref',
            label: 'Ticket ref',
            category: 'support',
            regex: 'TK-\\d+',
            caseSensitive: true,
            enabled: true,
          },
        ],
      },
    });
    expect(await screen.findByText('Catalogue saved.')).toBeInTheDocument();
    // Saved: the new id is locked now, Save is off, the list is no longer the built-in one.
    expect(screen.getByLabelText('Id of ticket_ref')).toHaveAttribute('readonly');
    expect(saveCatalogue()).toBeInactive();
    expect(screen.queryByText('Built-in defaults')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete order_number' }));
    fireEvent.click(saveCatalogue());
    await waitFor(() => expect(puts).toHaveLength(2));
    expect((puts[1].body as { presets: { id: string }[] }).presets.map((row) => row.id)).toEqual([
      'ticket_ref',
    ]);
  });

  it('a refused list shows the backend reason (`message` or `error`)', async () => {
    putReply = () =>
      Promise.reject(
        Object.assign(new Error('Bad Request'), {
          status: 400,
          data: { success: false, message: 'Duplicate id: order_number' },
        })
      );
    wrap(<SkillPatternsCard caps={CAPS} />);
    await screen.findByLabelText('Id of order_number');
    fireEvent.change(screen.getByLabelText('Label of order_number'), {
      target: { value: 'Order' },
    });
    fireEvent.click(saveCatalogue());
    expect(await screen.findByText('Duplicate id: order_number')).toBeInTheDocument();

    putReply = () =>
      Promise.reject(
        Object.assign(new Error('Bad Request'), {
          status: 400,
          data: { success: false, error: 'Pattern contains nested quantifiers' },
        })
      );
    fireEvent.click(saveCatalogue());
    expect(await screen.findByText('Pattern contains nested quantifiers')).toBeInTheDocument();
  });

  it('an older backend (404) says the catalogue is not there yet', async () => {
    catalogueReply = () =>
      Promise.reject(Object.assign(new Error('Not found'), { status: 404, data: {} }));
    wrap(<SkillPatternsCard caps={CAPS} />);
    expect(await screen.findByText(/pattern catalogue yet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save catalogue' })).not.toBeInTheDocument();
  });
});
