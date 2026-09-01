/**
 * Saving a wording change used to PUT the whole form, `active` included — so a stale or
 * unchecked checkbox could switch a customer-facing template on or off as a side effect of
 * fixing a typo. Same 2026-08-16 incident as the workspace banner: activation state moved
 * without anyone deciding to move it.
 *
 * The toggle owns `active`. The form owns the words. The control matters as much as the
 * assertion: the toggle must still send `active` and nothing else.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { PromptsSettings } from '../PromptsSettings';

const getPromptTemplates = vi.fn();
const updatePromptTemplate = vi.fn();

vi.mock('@/services/settings.service', () => ({
  settingsService: {
    getPromptTemplates: () => getPromptTemplates() as unknown,
    updatePromptTemplate: (id: number, body: unknown) => updatePromptTemplate(id, body) as unknown,
    createPromptTemplate: vi.fn(),
  },
}));
vi.mock('@/components/admin/DepartmentBadge', () => ({ default: () => null }));

const TEMPLATE = {
  id: 7,
  name: 'reply_style',
  description: 'How replies read',
  prompt: 'Answer warmly.',
  active: true,
};

beforeEach(() => {
  getPromptTemplates.mockReset();
  updatePromptTemplate.mockReset();
  getPromptTemplates.mockResolvedValue([TEMPLATE]);
  updatePromptTemplate.mockResolvedValue({});
});
afterEach(cleanup);

describe('editing a prompt', () => {
  it('saves the wording without touching activation', async () => {
    render(<PromptsSettings />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(updatePromptTemplate).toHaveBeenCalled());
    const [, body] = updatePromptTemplate.mock.calls[0] as [number, Record<string, unknown>];
    expect(body).not.toHaveProperty('active');
    expect(body).toMatchObject({ name: 'reply_style', prompt: 'Answer warmly.' });
  });

  it('does not offer an Active control in the edit form — it would not be submitted', async () => {
    render(<PromptsSettings />);
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }));
    expect(screen.queryByLabelText('Active')).not.toBeInTheDocument();
  });

  it('CONTROL: the row toggle still owns activation, and sends only that', async () => {
    render(<PromptsSettings />);
    fireEvent.click(
      await screen.findByRole('button', { name: /activate or deactivate this prompt/i })
    );

    await waitFor(() => expect(updatePromptTemplate).toHaveBeenCalledWith(7, { active: false }));
  });
});
