/** AI Prompts decides the engine's suggested house style (reply_style.update) in place. Invented data. */
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest';
import type * as LearningServiceModule from '@/services/learning.service';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const templates = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock('@/services/settings.service', () => ({
  settingsService: { getPromptTemplates: () => Promise.resolve(templates.list) },
}));
vi.mock('@/components/admin/DepartmentBadge', () => ({ default: () => null }));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));

const SUGGESTIONS_LAG_MS = 30;
const gate = vi.hoisted(() => ({ wait: null as Promise<void> | null }));
const pending = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock('@/services/learning.service', async (importOriginal) => {
  const actual = await importOriginal<typeof LearningServiceModule>();
  return {
    ...actual,
    learningService: {
      acceptSuggestion: () => gate.wait ?? Promise.resolve(),
      declineSuggestion: () => Promise.resolve(),
      // The suggestions panel mounts only once the templates are in, and asks on its own; on a
      // busy runner its answer lands a while later. Answered on a later task here, so a test that
      // reaches for the panel before waiting for it fails every time, not 1 run in many.
      listSuggestions: (domain?: string) =>
        new Promise((resolve) => {
          setTimeout(
            () => resolve((pending.list as Array<{ domain: string }>).filter((item) => !domain || item.domain === domain)),
            SUGGESTIONS_LAG_MS
          );
        }),
    },
  };
});
vi.mock('@/hooks/useSuggestionDomainAccess', () => ({
  useSuggestionDomainAccess: () => ({ canActOn: () => true, canActOnSuggestion: () => true, canActOnAnyDomain: true }),
}));
const suggestion = (id: number, domain: string, suggestionType: string, payload: Record<string, unknown> = {}) => ({
  id, domain, suggestionType, payload, evidenceEventIds: null, evidenceCount: 3, confidence: null,
  status: 'pending', expiresAt: '9999-12-31T00:00:00Z', createdAt: '2026-10-14T09:00:00Z',
});

import { PromptsSettings } from '../PromptsSettings';

beforeEach(() => { pending.list = []; templates.list = []; gate.wait = null; });

const replyStyle = (prompt: string, active: boolean) => ({
  id: 7, name: 'reply_style', description: 'House style', prompt, active, departmentId: null, type: 'system',
});
afterEach(cleanup);

describe('AI Prompts › Suggested house style', () => {
  it('a pending house-style suggestion shows its diff and can be accepted or declined', async () => {
    pending.list = [
      suggestion(51, 'reply_style', 'reply_style.update', {
        currentStyle: 'Be formal.',
        proposedStyle: 'Be warm and brief.',
        rationale: 'Agents shorten drafts.',
        signals: { distinctConvs: 4, distinctAgents: 2 },
      }),
    ];
    render(<PromptsSettings />);
    expect(await screen.findByRole('button', { name: 'Accept this suggestion' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeTruthy();
    expect(screen.getByText(/Suggested house style/)).toBeTruthy();
  });

  it('any pending reply_style suggestion is decidable here, whatever its type', async () => {
    pending.list = [
      suggestion(52, 'reply_style', 'reply_style.refresh', {
        currentStyle: 'Be formal.',
        proposedStyle: 'Be warm and brief.',
        rationale: 'Agents shorten drafts.',
        signals: {},
      }),
    ];
    render(<PromptsSettings />);
    expect(await screen.findByRole('button', { name: 'Accept this suggestion' })).toBeTruthy();
  });

  it('accepting reloads the templates, so reply_style shows the adopted text and an open editor cannot save the old one', async () => {
    templates.list = [replyStyle('Be formal.', false)];
    pending.list = [
      suggestion(53, 'reply_style', 'reply_style.update', {
        currentStyle: 'Be formal.', proposedStyle: 'Be warm and brief.', rationale: 'Agents shorten drafts.', signals: {},
      }),
    ];
    render(<PromptsSettings />);
    fireEvent.click(await screen.findByRole('button', { name: /^Advanced/ }));
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    expect(screen.getByDisplayValue('Be formal.')).toBeTruthy();

    // The server now holds the accepted style, switched on.
    templates.list = [replyStyle('Be warm and brief.', true)];
    // The suggestions load in their own request: wait for the button, do not assume it is there
    // once the templates are (a race that failed on a loaded CI runner, 2026-11-24).
    fireEvent.click(await screen.findByRole('button', { name: 'Accept this suggestion' }));

    await waitFor(() => expect(screen.getByText('Active')).toBeTruthy());
    expect(screen.queryByDisplayValue('Be formal.')).toBeNull();
    expect(screen.queryByText('Inactive')).toBeNull();
  });

  it('an editor on ANOTHER template keeps the typing when a house style is accepted', async () => {
    const other = { id: 8, name: 'spam_check', description: '', prompt: 'Spam?', active: true, departmentId: null, type: 'custom' };
    templates.list = [other];
    pending.list = [suggestion(54, 'reply_style', 'reply_style.update', { currentStyle: '', proposedStyle: 'Be warm.', rationale: '', signals: {} })];
    render(<PromptsSettings />);
    fireEvent.click(await screen.findByRole('button', { name: /^Advanced/ }));
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    fireEvent.change(screen.getByDisplayValue('Spam?'), { target: { value: 'Spam? typed' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Accept this suggestion' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Accept this suggestion' })).toBeNull());
    expect(screen.getByDisplayValue('Spam? typed')).toBeTruthy();
  });

  it('a decline leaves an open reply_style editor alone (a decline changes no template)', async () => {
    templates.list = [replyStyle('Be formal.', false)];
    pending.list = [suggestion(55, 'reply_style', 'reply_style.update', { currentStyle: '', proposedStyle: 'Be warm.', rationale: '', signals: {} })];
    render(<PromptsSettings />);
    fireEvent.click(await screen.findByRole('button', { name: /^Advanced/ }));
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    fireEvent.change(screen.getByDisplayValue('Be formal.'), { target: { value: 'Be formal, typed' } });
    // The suggestions load in their own request: wait for the button (the race test 3 also had).
    fireEvent.click(await screen.findByRole('button', { name: 'Decline' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Decline' })).toBeNull());
    expect(screen.getByDisplayValue('Be formal, typed')).toBeTruthy();
  });

  it('a reply_style editor opened WHILE the accept is in flight is still closed (no stale closure)', async () => {
    let release!: () => void;
    gate.wait = new Promise<void>((resolve) => { release = resolve; });
    templates.list = [replyStyle('Be formal.', false)];
    pending.list = [suggestion(56, 'reply_style', 'reply_style.update', { currentStyle: '', proposedStyle: 'Be warm.', rationale: '', signals: {} })];
    render(<PromptsSettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Accept this suggestion' }));
    fireEvent.click(screen.getByRole('button', { name: /^Advanced/ }));
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    expect(screen.getByDisplayValue('Be formal.')).toBeTruthy();
    templates.list = [replyStyle('Be warm.', true)];
    release();
    await waitFor(() => expect(screen.queryByDisplayValue('Be formal.')).toBeNull());
  });
});

describe('AI Prompts › the templates sit under a closed "Advanced" (settings quick wins, Task 3)', () => {
  const other = {
    id: 8,
    name: 'message_analysis',
    description: 'Analysis',
    prompt: 'Analyse.',
    active: true,
    departmentId: null,
    type: 'system',
  };

  it('the list is collapsed; the summary counts the templates and says the house style is on', async () => {
    templates.list = [replyStyle('Be warm.', true), other];
    pending.list = [
      suggestion(54, 'reply_style', 'reply_style.update', {
        currentStyle: 'Be warm.', proposedStyle: 'Be brief.', rationale: 'Agents shorten drafts.', signals: {},
      }),
    ];
    render(<PromptsSettings />);
    const header = await screen.findByRole('button', { name: /^Advanced/ });
    expect(header).toHaveTextContent('2 templates · house style on');
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('message_analysis')).not.toBeVisible();
    // The suggestion stays above it, visible.
    expect(await screen.findByRole('button', { name: 'Accept this suggestion' })).toBeVisible();
  });

  it('CONTROL — an inactive house style is not called on', async () => {
    templates.list = [replyStyle('Be warm.', false), other];
    render(<PromptsSettings />);
    const header = await screen.findByRole('button', { name: /^Advanced/ });
    expect(header.textContent).toMatch(/2 templates$/);
  });

  it('"Add Prompt" opens the closed panel, so the new form is visible', async () => {
    templates.list = [other];
    render(<PromptsSettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add Prompt' }));
    expect(screen.getByText('New Prompt Template')).toBeVisible();
  });
});
