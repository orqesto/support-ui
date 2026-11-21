import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render as rtlRender, screen, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import type { Integration } from '@/services/integrations.service';

/**
 * Slack and WhatsApp: nothing on these channels replies on its own, so their team panel has no
 * automatic-replies switch and keeps the plain "Assign teams" name. The button exists only while
 * teams are on (with teams off there would be nothing to open).
 */

const teams = vi.hoisted(() => ({ on: true }));

vi.mock('@/features/settings/hooks/useIntegrationCard', () => ({
  useIntegrationCard: () => ({
    showForm: false,
    saving: false,
    testing: null,
    deleting: null,
    deleteConfirm: null,
    editingId: null,
    config: {},
    name: '',
    setShowForm: vi.fn(),
    setConfig: vi.fn(),
    setDeleteConfirm: vi.fn(),
    setName: vi.fn(),
    resetForm: vi.fn(),
    loadForEdit: vi.fn(),
    saveIntegration: vi.fn(),
    testConnection: vi.fn(),
    deleteIntegration: vi.fn(),
  }),
}));

vi.mock('@/features/settings/hooks/useCreateSourceDepartments', () => ({
  useCreateSourceDepartments: () => ({
    departments: [],
    selectedIds: [],
    defaultId: undefined,
    loading: false,
    teamsEnabled: teams.on,
    setSelectedIds: vi.fn(),
    setDefaultId: vi.fn(),
    reset: vi.fn(),
    payload: {},
  }),
}));

vi.mock('@/features/settings/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: false, resolved: true, available: true }),
  useRefreshAiDrafts: () => () => undefined,
}));

vi.mock('@/services/department.service', () => ({
  departmentService: {
    getAll: (_inactive: boolean, onTeamsMode?: (value: boolean) => void) => {
      onTeamsMode?.(true);
      return Promise.resolve([
        { id: 4, name: 'Support', active: true },
        { id: 5, name: 'Sales', active: true },
      ]);
    },
  },
}));

vi.mock('@/services/integrations.service', () => ({
  integrationsService: {
    // A link with its switch on: the panel would list it if it showed the switch at all.
    getSourceDepartments: () =>
      Promise.resolve({
        success: true,
        data: [
          { id: 9, departmentId: 4, name: 'Support', isDefault: true, autoReplyEnabled: true },
        ],
      }),
    setSourceDepartments: vi.fn(),
    updateSourceDepartmentLink: vi.fn(),
    syncWhatsAppTemplates: vi.fn(),
  },
}));

vi.mock('@/components/shared/DepartmentMultiPicker', () => ({
  DepartmentMultiPicker: () => <div data-testid="team-picker" />,
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

const { SlackIntegrationCard } = await import(
  '@/features/settings/components/integrations/SlackIntegrationCard'
);
const { WhatsAppIntegrationCard } = await import(
  '@/features/settings/components/integrations/WhatsAppIntegrationCard'
);

const render = (ui: ReactElement) => rtlRender(<ThemeProvider>{ui}</ThemeProvider>);

const source = (type: 'slack' | 'whatsapp'): Integration =>
  ({
    id: 7,
    type,
    name: type === 'slack' ? 'Slack Workspace' : 'WhatsApp Business',
    enabled: true,
    hasCredentials: true,
    config: {},
  }) as Integration;

const cards = [
  {
    label: 'Slack',
    renderCard: () =>
      render(
        <SlackIntegrationCard
          integrations={[source('slack')]}
          onRefresh={vi.fn()}
          onShowAlert={vi.fn()}
        />
      ),
  },
  {
    label: 'WhatsApp',
    renderCard: () =>
      render(
        <WhatsAppIntegrationCard
          integrations={[source('whatsapp')]}
          onRefresh={vi.fn()}
          onShowAlert={vi.fn()}
        />
      ),
  },
];

beforeEach(() => {
  teams.on = true;
});

describe.each(cards)(
  '$label card — team panel without the automatic-replies switch',
  ({ renderCard }) => {
    it('"Assign teams" opens the team picker and no automatic-replies switch', async () => {
      renderCard();
      fireEvent.click(screen.getByRole('button', { name: 'Assign teams' }));

      expect(await screen.findByTestId('team-picker')).toBeInTheDocument();
      expect(screen.getByText('Assign teams')).toBeInTheDocument();
      // Let the panel's load settle, then the switch area must still be absent.
      expect(await screen.findByRole('button', { name: 'Save' })).toBeInTheDocument();
      expect(screen.queryByText(/Automatic replies (on|off)/)).not.toBeInTheDocument();
      expect(screen.queryByText('Automatic replies per team:')).not.toBeInTheDocument();
      expect(screen.queryByText(/Teams and automatic replies/)).not.toBeInTheDocument();
    });

    it('has no "Assign teams" button while teams are off', () => {
      teams.on = false;
      renderCard();
      expect(screen.queryByRole('button', { name: 'Assign teams' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /automatic replies/i })).not.toBeInTheDocument();
    });
  }
);
