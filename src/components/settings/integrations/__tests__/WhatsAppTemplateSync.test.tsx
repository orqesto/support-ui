import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import type { AlertState } from '@/components/settings/integrations/types';
import type { Integration, WhatsAppConfig } from '@/services/integrations.service';

/**
 * The "Templates" button on the WhatsApp card.
 *
 * The sync endpoint shipped with no caller in the app, so the composer's template picker
 * stayed permanently empty and agents saw "nothing approved yet" on a WABA full of
 * approved templates. Outside the 24-hour window a template is the only sendable thing,
 * so that is a conversation that cannot be continued — not a cosmetic gap.
 */
const syncWhatsAppTemplates = vi.fn();

vi.mock('@/services/integrations.service', () => ({
  integrationsService: {
    syncWhatsAppTemplates: (id: number) => syncWhatsAppTemplates(id) as unknown,
  },
}));

vi.mock('@/hooks/useIntegrationCard', () => ({
  useIntegrationCard: () => ({
    showForm: false,
    saving: false,
    testing: null,
    deleting: null,
    deleteConfirm: null,
    editingId: null,
    config: {
      phoneNumberId: '',
      wabaId: '',
      accessToken: '',
      appSecret: '',
      verifyToken: '',
    },
    setShowForm: vi.fn(),
    setConfig: vi.fn(),
    setDeleteConfirm: vi.fn(),
    resetForm: vi.fn(),
    loadForEdit: vi.fn(),
    saveIntegration: vi.fn(),
    testConnection: vi.fn(),
    deleteIntegration: vi.fn(),
  }),
}));

vi.mock('@/hooks/useCreateSourceDepartments', () => ({
  useCreateSourceDepartments: () => ({
    departments: [],
    selectedIds: [],
    defaultId: undefined,
    loading: false,
    setSelectedIds: vi.fn(),
    setDefaultId: vi.fn(),
    reset: vi.fn(),
    payload: {},
  }),
}));

const { WhatsAppIntegrationCard } = await import(
  '@/components/settings/integrations/WhatsAppIntegrationCard'
);

const render = (ui: ReactElement) => rtlRender(<ThemeProvider>{ui}</ThemeProvider>);

const source = (config: Partial<WhatsAppConfig>): Integration =>
  ({
    id: 7,
    type: 'whatsapp',
    name: 'WhatsApp Business',
    enabled: true,
    hasCredentials: true,
    config,
  }) as Integration;

const onShowAlert = vi.fn<(alert: AlertState) => void>();

/** The alert the card raised — typed, so assertions below are not `any` lookups. */
const lastAlert = (): AlertState => onShowAlert.mock.calls[0][0];

const renderCard = (config: Partial<WhatsAppConfig>) =>
  render(
    <WhatsAppIntegrationCard
      integrations={[source(config)]}
      onRefresh={vi.fn()}
      onShowAlert={onShowAlert}
    />
  );

const templatesButton = () => screen.getByRole('button', { name: /templates/i });

describe('WhatsApp card — sync templates', () => {
  beforeEach(() => {
    syncWhatsAppTemplates.mockReset();
    onShowAlert.mockReset();
  });

  it('is disabled without a WABA id, because the sync could only 400', () => {
    renderCard({ phoneNumberId: '123' });
    expect(templatesButton()).toBeDisabled();
  });

  it('syncs the source it belongs to', async () => {
    syncWhatsAppTemplates.mockResolvedValue({ success: true, data: { synced: 4, approved: 3 } });
    renderCard({ phoneNumberId: '123', wabaId: '456' });
    fireEvent.click(templatesButton());
    await waitFor(() => expect(syncWhatsAppTemplates).toHaveBeenCalledWith(7));
  });

  it('reports approved templates as a success', async () => {
    syncWhatsAppTemplates.mockResolvedValue({ success: true, data: { synced: 4, approved: 3 } });
    renderCard({ phoneNumberId: '123', wabaId: '456' });
    fireEvent.click(templatesButton());
    await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
    expect(lastAlert().variant).toBe('success');
    expect(lastAlert().description).toContain('3 approved');
  });

  it('does NOT report success when Meta approved none of them', async () => {
    // Synced-but-none-approved is the case that looks like a win and is not one: the
    // picker stays empty and a closed window still cannot be answered.
    syncWhatsAppTemplates.mockResolvedValue({ success: true, data: { synced: 5, approved: 0 } });
    renderCard({ phoneNumberId: '123', wabaId: '456' });
    fireEvent.click(templatesButton());
    await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
    expect(lastAlert().variant).toBe('error');
    expect(lastAlert().description).toMatch(/24-hour window/i);
  });

  it("surfaces the server's own message on failure, not a generic one", async () => {
    // The 4xx copy names the actual cause; a generic "sync failed" would hide it.
    syncWhatsAppTemplates.mockRejectedValue(
      new Error('This WhatsApp integration has no WhatsApp Business Account ID (wabaId)')
    );
    renderCard({ phoneNumberId: '123', wabaId: '456' });
    fireEvent.click(templatesButton());
    await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
    expect(lastAlert().description).toContain('wabaId');
  });
});
