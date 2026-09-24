import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * The per-department switch is the AI auto-reply. With AI drafts off it is kept (it applies again
 * when drafts come back), so a green "Auto-reply on" must be accompanied by the fact that nothing
 * is sent meanwhile.
 */

const aiDrafts = vi.hoisted(() => ({ off: true }));
vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: aiDrafts.off, resolved: true, available: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/services/department.service', () => ({
  departmentService: {
    getAll: () => Promise.resolve([{ id: 4, name: 'Support', active: true }]),
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
  it('says the AI sends no auto-reply while drafts are off', async () => {
    renderEditor();
    expect(await screen.findByText('Auto-reply on')).toBeInTheDocument();
    expect(screen.getByText(/the AI sends no auto-reply/i)).toBeInTheDocument();
  });

  it('says nothing of the kind with drafts on (control)', async () => {
    aiDrafts.off = false;
    renderEditor();
    expect(await screen.findByText('Auto-reply on')).toBeInTheDocument();
    expect(screen.queryByText(/the AI sends no auto-reply/i)).not.toBeInTheDocument();
  });
});
