import { useState } from 'react';
import {
  Building2,
  Check,
  Copy,
  Edit,
  Plus,
  RefreshCw,
  Save,
  TestTube2,
  Trash2,
} from 'lucide-react';
import DepartmentBadge from '@/components/admin/DepartmentBadge';
import { SourceDepartmentEditor } from '@/components/settings/integrations/SourceDepartmentEditor';
import type { IntegrationCardProps } from '@/components/settings/integrations/types';
import { DepartmentMultiPicker } from '@/components/shared/DepartmentMultiPicker';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useCreateSourceDepartments } from '@/hooks/useCreateSourceDepartments';
import { useIntegrationCard } from '@/hooks/useIntegrationCard';
import { API_BASE_URL } from '@/lib/config';
import { integrationsService, type WhatsAppConfig } from '@/services/integrations.service';

/**
 * Form state mirrors the service's WhatsAppConfig, but with every field present: a
 * controlled input cannot take `undefined` without React switching it to uncontrolled
 * mid-edit. wabaId is optional on the wire and always a string here.
 */
type WhatsAppFormConfig = Required<WhatsAppConfig>;

const EMPTY_CONFIG: WhatsAppFormConfig = {
  phoneNumberId: '',
  wabaId: '',
  accessToken: '',
  appSecret: '',
  verifyToken: '',
};

/** The phone-number id names the number without being a secret. */
const nameFromNumber = (config: WhatsAppFormConfig): string | null =>
  config.phoneNumberId ? `WhatsApp ${config.phoneNumberId}` : null;

/** The URL the customer pastes into Meta. Setup cannot be completed without it. */
const WEBHOOK_URL = `${API_BASE_URL}/api/webhooks/whatsapp`;

/**
 * WhatsApp Business (Meta Cloud API).
 *
 * Structurally the same as the Telegram card, with one difference that matters: WhatsApp
 * setup is a TWO-SIDED handshake. Telegram needs one token pasted in here; WhatsApp also
 * needs a callback URL and a verify token pasted into Meta's own dashboard, and Meta will
 * not deliver a single message until that side is done. So the card surfaces the webhook
 * URL as copyable text rather than leaving the customer to guess it — without it the
 * integration silently receives nothing and looks broken.
 */
export const WhatsAppIntegrationCard = ({
  integrations,
  onRefresh,
  onShowAlert,
}: IntegrationCardProps) => {
  const [editDepts, setEditDepts] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [syncing, setSyncing] = useState<number | null>(null);

  const deptPicker = useCreateSourceDepartments();

  /**
   * Refresh the approved-template cache from Meta.
   *
   * This shipped as an API-only endpoint with no way to call it from the app, which made
   * the composer's template picker permanently empty: agents saw "nothing approved yet"
   * on a WABA full of approved templates, and the only remedy was an admin with curl.
   * Outside the 24-hour window a template is the ONLY thing that can be sent, so an empty
   * cache is not cosmetic — it is a conversation that cannot be continued.
   */
  const syncTemplates = async (id: number, name: string) => {
    setSyncing(id);
    try {
      const response = await integrationsService.syncWhatsAppTemplates(id);
      const { synced = 0, approved = 0 } = response.data ?? {};
      onShowAlert({
        open: true,
        title: 'Templates synced',
        description:
          approved > 0
            ? `${name}: ${synced} template(s) from Meta, ${approved} approved and ready to send.`
            : `${name}: ${synced} template(s) from Meta, but none are approved yet — until Meta ` +
              'approves one, agents cannot reply outside the 24-hour window.',
        variant: approved > 0 ? 'success' : 'error',
      });
    } catch (error) {
      // Surface the server's own copy on a 4xx. It names the actual cause — most often a
      // missing WhatsApp Business Account ID — which a generic "sync failed" would hide.
      onShowAlert({
        open: true,
        title: 'Sync failed',
        description:
          error instanceof Error ? error.message : `Could not sync templates for ${name}.`,
        variant: 'error',
      });
    } finally {
      setSyncing(null);
    }
  };

  const whatsappIntegrations = integrations.filter((integ) => integ.type === 'whatsapp');

  const {
    showForm,
    saving,
    testing,
    deleting,
    deleteConfirm,
    editingId,
    config,
    name,
    setShowForm,
    setConfig,
    setDeleteConfirm,
    setName,
    resetForm,
    loadForEdit,
    saveIntegration,
    testConnection,
    deleteIntegration,
  } = useIntegrationCard<WhatsAppFormConfig>({
    integrationType: 'whatsapp',
    integrationDisplayName: 'WhatsApp Business',
    initialConfig: EMPTY_CONFIG,
    onRefresh,
    onShowAlert,
    // The BE upserts on name + type: a second number saved under the constant display
    // name used to overwrite the first. Default to a name derived from the number id.
    existingNames: whatsappIntegrations.map((integ) => integ.name),
    deriveName: nameFromNumber,
    // Departments ride along with the insert rather than a follow-up call, so a source
    // can never be committed enabled-but-unlinked. Same reasoning as the Telegram card.
    createDepartments: {
      departmentIds: deptPicker.selectedIds,
      defaultDepartmentId: deptPicker.defaultId,
    },
  });

  const copyWebhookUrl = () => {
    void navigator.clipboard.writeText(WEBHOOK_URL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Every field except wabaId is required to receive or send anything: phoneNumberId
  // routes inbound deliveries, appSecret authenticates them, verifyToken completes Meta's
  // subscription handshake, and accessToken is needed to reply.
  //
  // wabaId stays OUT of this gate deliberately. A number without one still receives and
  // replies perfectly well inside the 24-hour window, and demanding it up front would
  // block a setup that works. It is only templates that cannot function without it, which
  // is what the field's own copy now says.
  const requiredFilled =
    Boolean(config.phoneNumberId) &&
    Boolean(config.accessToken) &&
    Boolean(config.appSecret) &&
    Boolean(config.verifyToken);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex gap-2 items-center text-md md:text-lg lg:text-xl">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-green-500" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              WhatsApp Business
            </CardTitle>
            <Button
              size="sm"
              className="py-5"
              onClick={() => {
                resetForm();
                setShowForm(!showForm);
              }}
            >
              <Plus className="mr-1 w-4 h-4 hidden sm:block" />
              Add WhatsApp
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {whatsappIntegrations.length > 0 && (
            <div className="space-y-2">
              {whatsappIntegrations.map((integration) => (
                <div key={integration.id}>
                  <div className="flex flex-col gap-3 p-3 rounded-lg border sm:flex-row sm:justify-between sm:items-center">
                    <div className="flex flex-1 gap-3 items-center min-w-0">
                      <div
                        className={`w-2 h-2 rounded-full shrink-0 ${integration.enabled ? 'bg-green-500' : 'bg-gray-400'}`}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{integration.name}</p>
                          {typeof integration.departmentId === 'number' && (
                            <DepartmentBadge departmentId={integration.departmentId} size="sm" />
                          )}
                        </div>
                        <p className="text-xs break-all text-muted-foreground">
                          {(integration.config as WhatsAppFormConfig).phoneNumberId
                            ? `Number ID ${(integration.config as WhatsAppFormConfig).phoneNumberId}`
                            : 'Not configured'}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <Button
                        aria-label="Edit this WhatsApp source"
                        title="Edit this WhatsApp source"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          loadForEdit(
                            integration.id,
                            {
                              ...EMPTY_CONFIG,
                              ...(integration.config as Partial<WhatsAppFormConfig>),
                            },
                            integration.name
                          )
                        }
                        disabled={editingId === integration.id}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => testConnection(integration.id, integration.name)}
                        isLoading={testing === integration.id}
                        disabled={!integration.hasCredentials}
                      >
                        <TestTube2 className="w-4 h-4" />
                        Test
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => syncTemplates(integration.id, integration.name)}
                        isLoading={syncing === integration.id}
                        // Meta lists templates per WhatsApp Business Account, so without the
                        // WABA id the sync can only 400. Disable rather than let it fail.
                        disabled={!(integration.config as Partial<WhatsAppFormConfig>)?.wabaId}
                        title={
                          (integration.config as Partial<WhatsAppFormConfig>)?.wabaId
                            ? 'Pull approved message templates from Meta'
                            : 'Add the WhatsApp Business Account ID to sync templates'
                        }
                      >
                        <RefreshCw className="w-4 h-4" />
                        Templates
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditDepts(integration.id)}
                        title="Assign departments"
                        aria-label="Assign departments"
                      >
                        <Building2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setDeleteConfirm({ id: integration.id, name: integration.name })
                        }
                        isLoading={deleting === integration.id}
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                        <span className="sr-only">Delete</span>
                      </Button>
                    </div>
                  </div>
                  {editDepts === integration.id && (
                    <SourceDepartmentEditor
                      sourceId={integration.id}
                      onClose={() => setEditDepts(null)}
                      onSaved={() => {
                        setEditDepts(null);
                        void onRefresh();
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {showForm && (
            <div className="p-4 space-y-4 rounded-lg border bg-muted/50">
              <h4 className="font-medium">
                {editingId ? 'Edit WhatsApp Business' : 'Add WhatsApp Business'}
              </h4>

              {/* The half of setup that happens in Meta, not here. Shown first because
                  nothing arrives until it is done. */}
              <div className="p-3 space-y-2 rounded-md border border-dashed bg-background">
                <p className="text-sm font-medium">1. Point Meta at this webhook</p>
                <div className="flex gap-2 items-center">
                  <code className="flex-1 px-2 py-1 text-xs break-all rounded bg-muted">
                    {WEBHOOK_URL}
                  </code>
                  <Button variant="outline" size="sm" onClick={copyWebhookUrl} type="button">
                    {copied ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    <span className="sr-only">Copy webhook URL</span>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  In your Meta app under <strong>WhatsApp → Configuration</strong>, set this as the
                  Callback URL, paste the same Verify Token you enter below, and subscribe to the{' '}
                  <strong>messages</strong> field. Meta delivers nothing until this is done.
                </p>
              </div>

              <p className="text-sm font-medium">2. Credentials from your Meta app</p>

              <Input
                label="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="WhatsApp Business"
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="wa-phone-number-id" className="text-sm font-medium">
                    Phone Number ID
                  </label>
                  <input
                    id="wa-phone-number-id"
                    type="text"
                    value={config.phoneNumberId}
                    onChange={(event) =>
                      setConfig({ ...config, phoneNumberId: event.target.value.trim() })
                    }
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="123456789012345"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    WhatsApp → API Setup. Not the phone number itself.
                  </p>
                </div>

                <div>
                  <label htmlFor="wa-waba-id" className="text-sm font-medium">
                    WhatsApp Business Account ID{' '}
                    <span className="text-muted-foreground">(required for templates)</span>
                  </label>
                  <input
                    id="wa-waba-id"
                    type="text"
                    value={config.wabaId}
                    onChange={(event) =>
                      setConfig({ ...config, wabaId: event.target.value.trim() })
                    }
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="987654321098765"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    WhatsApp &rarr; API Setup, next to the phone number id. Without it, approved
                    templates cannot be synced &mdash; so a conversation whose 24-hour reply window
                    has closed cannot be continued at all.
                  </p>
                </div>
              </div>

              <div>
                <label htmlFor="wa-access-token" className="text-sm font-medium">
                  Access Token
                </label>
                <PasswordInput
                  id="wa-access-token"
                  value={config.accessToken}
                  onChange={(event) => setConfig({ ...config, accessToken: event.target.value })}
                  placeholder="EAAG..."
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Use a permanent System User token — the temporary one in API Setup expires in 24
                  hours and replies will start failing.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="wa-app-secret" className="text-sm font-medium">
                    App Secret
                  </label>
                  <PasswordInput
                    id="wa-app-secret"
                    value={config.appSecret}
                    onChange={(event) => setConfig({ ...config, appSecret: event.target.value })}
                    placeholder="From App Settings → Basic"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Verifies that deliveries genuinely came from Meta.
                  </p>
                </div>

                <div>
                  <label htmlFor="wa-verify-token" className="text-sm font-medium">
                    Verify Token
                  </label>
                  <PasswordInput
                    id="wa-verify-token"
                    value={config.verifyToken}
                    onChange={(event) => setConfig({ ...config, verifyToken: event.target.value })}
                    placeholder="A phrase you choose"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    You invent this. It must match exactly what you type into Meta above.
                  </p>
                </div>
              </div>

              {editingId === null && (
                <div className="space-y-2 pt-1 border-t">
                  <label className="text-sm font-medium flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5" /> Departments
                  </label>
                  <DepartmentMultiPicker
                    allDepts={deptPicker.departments}
                    selected={deptPicker.selectedIds}
                    defaultId={deptPicker.defaultId}
                    loading={deptPicker.loading}
                    onSelectedChange={deptPicker.setSelectedIds}
                    onDefaultChange={deptPicker.setDefaultId}
                  />
                  {!deptPicker.loading && deptPicker.departments.length === 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      No active departments. Create one before adding a source.
                    </p>
                  )}
                  {!deptPicker.loading &&
                    deptPicker.departments.length > 0 &&
                    !deptPicker.isValid && (
                      <p className="text-xs text-muted-foreground">
                        Select at least one department to route messages from this source.
                      </p>
                    )}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                WhatsApp only allows free-form replies within 24 hours of a customer’s last message.
                Outside that window a conversation can only be continued with a Meta-approved
                template, which isn’t supported yet.
              </p>

              <div className="flex gap-2">
                <Button
                  onClick={() => saveIntegration()}
                  isLoading={saving}
                  disabled={
                    !name.trim() || !requiredFilled || (editingId === null && !deptPicker.isValid)
                  }
                >
                  <Save className="mr-2 w-4 h-4" />
                  {editingId ? 'Update' : 'Save'} WhatsApp
                </Button>
                <Button variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {whatsappIntegrations.length === 0 && !showForm && (
            <p className="py-2 text-sm text-center text-muted-foreground">
              No WhatsApp numbers configured
            </p>
          )}
        </CardContent>
      </Card>

      {deleteConfirm && (
        <div className="flex fixed inset-0 z-50 justify-center items-center bg-black bg-opacity-50">
          <div className="p-6 mx-4 w-full max-w-md rounded-lg shadow-xl bg-card">
            <h3 className="mb-2 text-lg font-semibold">Delete Integration?</h3>
            <p className="mb-4 text-muted-foreground">
              Are you sure you want to delete <strong>{deleteConfirm.name}</strong>?
            </p>
            <p className="mb-6 text-sm text-red-600">This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting === deleteConfirm.id}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() =>
                  deleteConfirm && void deleteIntegration(deleteConfirm.id, deleteConfirm.name)
                }
                isLoading={deleting === deleteConfirm.id}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
