import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * The per-department switch is the AI auto-reply. With AI drafts off it is kept (it applies again
 * when drafts come back), so a green "Auto-reply on" must be accompanied by the fact that nothing
 * is sent meanwhile.
 */

const aiDrafts = vi.hoisted(() => ({ off: true }));
vi.mock('@/features/settings/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: aiDrafts.off, resolved: true, available: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/services/department.service', () => ({
  departmentService: {
    getAll: (_inactive: boolean, onTeamsMode?: (value: boolean) => void) => {
      onTeamsMode?.(true);
      return Promise.resolve([{ id: 4, name: 'Support', active: true }]);
    },
  },
}));
vi.mock('@/services/integrations.service', () => ({
  integrationsService: {
    getSourceDepartments: () =>
      Promise.resolve({
        success: true,
        data: [
          { id: 9, departmentId: 4, name: 'Support', isDefault: true, autoReplyEnabled: true },
        ],
      }),
    setSourceDepartments: vi.fn(),
    updateSourceDepartment: vi.fn(),
  },
}));
vi.mock('@/components/shared/DepartmentMultiPicker', () => ({ DepartmentMultiPicker: () => null }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

import { SourceDepartmentEditor } from '../SourceDepartmentEditor';

const renderEditor = () =>
  render(<SourceDepartmentEditor sourceId={1} onClose={() => {}} onSaved={() => {}} />);

beforeEach(() => {
  aiDrafts.off = true;
});

describe('SourceDepartmentEditor — AI drafts off', () => {
  it('says the AI sends no automatic reply while drafts are off', async () => {
    renderEditor();
    expect(await screen.findByText('Automatic replies on')).toBeInTheDocument();
    expect(screen.getByText(/the AI sends no automatic reply/i)).toBeInTheDocument();
  });

  it('says nothing of the kind with drafts on (control)', async () => {
    aiDrafts.off = false;
    renderEditor();
    expect(await screen.findByText('Automatic replies on')).toBeInTheDocument();
    expect(screen.queryByText(/the AI sends no automatic reply/i)).not.toBeInTheDocument();
  });
});

describe('SourceDepartmentEditor — each channel shows only its own help', () => {
  it('mailbox: the mailbox sentence and the receipt-confirmation note, no Telegram sentence', async () => {
    aiDrafts.off = false;
    renderEditor();
    expect(await screen.findByText(/^Mailbox: stops keyword rules/)).toBeInTheDocument();
    expect(screen.getByText(/Not covered: the receipt confirmation\./)).toBeInTheDocument();
    expect(screen.queryByText(/Telegram: stops the bot/)).not.toBeInTheDocument();
  });

  it('Telegram: the Telegram sentence only, without the email-only receipt note', async () => {
    aiDrafts.off = false;
    render(
      <SourceDepartmentEditor
        sourceId={1}
        autoReply="telegram"
        onClose={() => {}}
        onSaved={() => {}}
      />
    );
    expect(await screen.findByText(/^Telegram: stops the bot/)).toBeInTheDocument();
    expect(screen.queryByText(/^Mailbox:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/receipt confirmation/)).not.toBeInTheDocument();
  });

  it('names the panel "Teams and automatic replies" on a mailbox with teams on', async () => {
    aiDrafts.off = false;
    renderEditor();
    expect(await screen.findByText('Teams and automatic replies')).toBeInTheDocument();
    expect(screen.queryByText('Assign teams')).not.toBeInTheDocument();
  });
});
