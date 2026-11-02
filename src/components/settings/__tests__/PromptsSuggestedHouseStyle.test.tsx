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

const gate = vi.hoisted(() => ({ wait: null as Promise<void> | null }));
const pending = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock('@/services/learning.service', async (importOriginal) => {
  const actual = await importOriginal<typeof LearningServiceModule>();
  return {
    ...actual,
    learningService: {
      acceptSuggestion: () => gate.wait ?? Promise.resolve(),
      declineSuggestion: () => Promise.resolve(),
      listSuggestions: (domain?: string) =>
        Promise.resolve((pending.list as Array<{ domain: string }>).filter((item) => !domain || item.domain === domain)),
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
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    expect(screen.getByDisplayValue('Be formal.')).toBeTruthy();

    // The server now holds the accepted style, switched on.
    templates.list = [replyStyle('Be warm and brief.', true)];
    fireEvent.click(screen.getByRole('button', { name: 'Accept this suggestion' }));

    await waitFor(() => expect(screen.getByText('Active')).toBeTruthy());
    expect(screen.queryByDisplayValue('Be formal.')).toBeNull();
    expect(screen.queryByText('Inactive')).toBeNull();
  });

  it('an editor on ANOTHER template keeps the typing when a house style is accepted', async () => {
    const other = { id: 8, name: 'spam_check', description: '', prompt: 'Spam?', active: true, departmentId: null, type: 'custom' };
    templates.list = [other];
    pending.list = [suggestion(54, 'reply_style', 'reply_style.update', { currentStyle: '', proposedStyle: 'Be warm.', rationale: '', signals: {} })];
    render(<PromptsSettings />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    fireEvent.change(screen.getByDisplayValue('Spam?'), { target: { value: 'Spam? typed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept this suggestion' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Accept this suggestion' })).toBeNull());
    expect(screen.getByDisplayValue('Spam? typed')).toBeTruthy();
  });

  it('a decline leaves an open reply_style editor alone (a decline changes no template)', async () => {
    templates.list = [replyStyle('Be formal.', false)];
    pending.list = [suggestion(55, 'reply_style', 'reply_style.update', { currentStyle: '', proposedStyle: 'Be warm.', rationale: '', signals: {} })];
    render(<PromptsSettings />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    fireEvent.change(screen.getByDisplayValue('Be formal.'), { target: { value: 'Be formal, typed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
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
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    expect(screen.getByDisplayValue('Be formal.')).toBeTruthy();
    templates.list = [replyStyle('Be warm.', true)];
    release();
    await waitFor(() => expect(screen.queryByDisplayValue('Be formal.')).toBeNull());
  });
});
