import {
  User,
  Phone,
  Mail,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Pencil,
  X,
  Check,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/Badge';
import { messageService } from '@/services/message.service';
import type { ApiResponse } from '@/types';
import { logger } from '@/lib/logger';

type LeadContactInfo = {
  name?: string;
  email?: string;
  phone?: string;
  isComplete: boolean;
};

type LeadQualificationState = {
  stage: keyof typeof STAGE_COLORS;
  contactInfo: LeadContactInfo;
  qualificationFields: Record<string, string | null>;
  category: string | null;
  objectionsRaised: string[];
  objectionsAddressed: string[];
  turnCount: number;
  qualifiedAt?: string;
  updatedAt: string;
};

export const STAGE_COLORS: Record<string, 'default' | 'secondary' | 'warning' | 'success' | 'danger'> = {
  initial: 'secondary',
  gathering_info: 'default',
  awaiting_project: 'warning',
  validating_drawings: 'warning',
  qualified: 'success',
  escalated: 'danger',
};

const stageColor = (stage: string): 'default' | 'secondary' | 'warning' | 'success' | 'danger' =>
  STAGE_COLORS[stage] ?? 'default';

const stageLabel = (stage: string): string =>
  stage.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

// Type guard function to validate lead state
const isValidLeadState = (state: unknown): state is LeadQualificationState => {
  if (typeof state !== 'object' || state === null) {
    return false;
  }

  const obj = state as Record<string, unknown>;
  return (
    typeof obj.stage === 'string' &&
    obj.stage in STAGE_COLORS && // ✅ Check that stage is actually a key of STAGE_COLORS
    typeof obj.contactInfo === 'object' &&
    obj.contactInfo !== null &&
    typeof obj.qualificationFields === 'object' &&
    obj.qualificationFields !== null &&
    (obj.category === null || typeof obj.category === 'string') &&
    Array.isArray(obj.objectionsRaised) &&
    obj.objectionsRaised.every((item: unknown) => typeof item === 'string') &&
    Array.isArray(obj.objectionsAddressed) &&
    obj.objectionsAddressed.every((item: unknown) => typeof item === 'string') &&
    typeof obj.turnCount === 'number' &&
    typeof obj.updatedAt === 'string' &&
    (obj.qualifiedAt === undefined || typeof obj.qualifiedAt === 'string')
  );
};

const StatusIcon = ({ value }: { value: boolean | null }) => {
  if (value === null) return <Clock className="w-4 h-4 text-muted-foreground" />;
  return value ? (
    <CheckCircle className="w-4 h-4 text-green-500" />
  ) : (
    <XCircle className="w-4 h-4 text-red-500" />
  );
};

type FieldDef = { key: string; label: string };

type LeadEnrichment = {
  detectedCategory?: string;
  routingAttributes?: { lang?: string };
};

type LeadQualificationPanelProps = {
  messageId: number;
  leadState: LeadQualificationState;
  fieldDefs?: FieldDef[];
  enrichment?: LeadEnrichment;
  onLeadStateUpdate?: (updated: LeadQualificationState) => void;
};

export const LeadQualificationPanel = ({
  messageId,
  leadState,
  fieldDefs,
  enrichment,
  onLeadStateUpdate,
}: LeadQualificationPanelProps) => {
  const fieldLabel = (key: string): string =>
    fieldDefs?.find((fld) => fld.key === key)?.label ??
    key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editContact, setEditContact] = useState({ name: '', email: '', phone: '' });
  const [editFields, setEditFields] = useState<Record<string, string>>({});

  const fieldEntries = Object.entries(leadState.qualificationFields).filter(
    ([key]) => !['files_received', 'files_count'].includes(key)
  );

  const filledCount = fieldEntries.filter(([, val]) => val !== null).length;

  const [fieldsExpanded, setFieldsExpanded] = useState(() => filledCount > 0);

  useEffect(() => {
    if (filledCount > 0) setFieldsExpanded(true);
  }, [filledCount]);
  const filesReceived = leadState.qualificationFields['files_received'] === 'true';
  const filesCount = leadState.qualificationFields['files_count'];

  const startEdit = () => {
    setEditContact({
      name: leadState.contactInfo.name ?? '',
      email: leadState.contactInfo.email ?? '',
      phone: leadState.contactInfo.phone ?? '',
    });
    const fields: Record<string, string> = {};
    for (const [key, val] of fieldEntries) {
      fields[key] = val ?? '';
    }
    setEditFields(fields);
    setFieldsExpanded(true);
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const saveEdit = async () => {
    setSaving(true);
    try {
      const contactPayload: { name?: string; email?: string; phone?: string } = {};
      if (editContact.name !== (leadState.contactInfo.name ?? ''))
        contactPayload.name = editContact.name || undefined;
      if (editContact.email !== (leadState.contactInfo.email ?? ''))
        contactPayload.email = editContact.email || undefined;
      if (editContact.phone !== (leadState.contactInfo.phone ?? ''))
        contactPayload.phone = editContact.phone || undefined;

      const fieldsPayload: Record<string, string | null> = {};
      for (const [key, val] of Object.entries(editFields)) {
        const original = leadState.qualificationFields[key] ?? '';
        if (val !== original) {
          fieldsPayload[key] = val.trim() === '' ? null : val.trim();
        }
      }

      const hasChanges =
        Object.keys(contactPayload).length > 0 || Object.keys(fieldsPayload).length > 0;
      if (hasChanges) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
          const response = await messageService.updateLeadState(messageId, {
            ...(Object.keys(contactPayload).length > 0 && { contactInfo: contactPayload }),
            ...(Object.keys(fieldsPayload).length > 0 && { qualificationFields: fieldsPayload }),
          });

          // Type guard to ensure response has the expected structure
          if (response && typeof response === 'object' && 'success' in response) {
            const result = response as ApiResponse<{ id: number; leadState: unknown }>;

            if (result.success && result.data) {
              const leadState = result.data.leadState;
              if (leadState && isValidLeadState(leadState)) {
                onLeadStateUpdate?.(leadState);
                // Also update the message metadata to include the lead stage for list display
                // This will be handled by the parent component that manages the message state
              }
            }
          }
        } catch (updateError) {
          const errorMessage =
            updateError instanceof Error ? updateError.message : String(updateError);
          logger.error('Failed to update lead state:', errorMessage);
          // Could show a toast notification here
        }
      }
      setEditing(false);
    } catch (error: unknown) {
      logger.error(
        'Failed to save lead qualification:',
        error instanceof Error ? error.message : String(error)
      );
      // Could show a toast notification here
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 space-y-4 rounded-lg border border-violet-500/20 bg-violet-500/5">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-violet-700 dark:text-violet-400">
          Lead Qualification
        </h3>
        <div className="flex gap-2 items-center">
          <Badge variant={stageColor(leadState.stage)}>{stageLabel(leadState.stage)}</Badge>
          {leadState.category && (
            <Badge variant="default">{leadState.category.toUpperCase()}</Badge>
          )}
          {enrichment?.detectedCategory && enrichment.detectedCategory !== leadState.category && (
            <Badge variant="warning" className="text-xs">
              {enrichment.detectedCategory}
            </Badge>
          )}
          {enrichment?.routingAttributes?.lang && (
            <Badge variant="secondary" className="text-xs">
              {enrichment.routingAttributes.lang}
            </Badge>
          )}
          {!editing ? (
            <button
              onClick={startEdit}
              className="p-1 rounded transition-colors hover:bg-violet-500/10 text-muted-foreground hover:text-violet-600"
              title="Edit qualification data"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div className="flex gap-1 items-center">
              <button
                onClick={saveEdit}
                disabled={saving}
                className="p-1 rounded transition-colors hover:bg-green-500/10 text-muted-foreground hover:text-green-600 disabled:opacity-50"
                title="Save changes"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={cancelEdit}
                disabled={saving}
                className="p-1 rounded transition-colors hover:bg-red-500/10 text-muted-foreground hover:text-red-500 disabled:opacity-50"
                title="Cancel"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Escalated Stage Warning */}
      {leadState.stage === 'escalated' && (
        <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/5">
          <div className="flex gap-2 items-center">
            <div className="w-2 h-2 bg-red-500 rounded-full" />
            <p className="text-sm font-medium text-red-700 dark:text-red-400">
              This lead has been escalated and requires immediate attention from a senior team
              member.
            </p>
          </div>
        </div>
      )}

      {/* Progress */}
      <div className="flex gap-2 items-center text-xs text-muted-foreground">
        <span>Turn {leadState.turnCount}</span>
        {leadState.qualifiedAt && (
          <>
            <span>·</span>
            <span>Qualified {new Date(leadState.qualifiedAt).toLocaleDateString()}</span>
          </>
        )}
      </div>

      {/* Contact Info */}
      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide uppercase text-muted-foreground">Contact</p>
        <div className="grid grid-cols-1 gap-1.5">
          {editing ? (
            <>
              <div className="flex gap-2 items-center">
                <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <input
                  className="flex-1 text-sm bg-background border border-input rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  placeholder="Name"
                  value={editContact.name}
                  onChange={(event) => setEditContact((prev) => ({ ...prev, name: event.target.value }))}
                />
              </div>
              <div className="flex gap-2 items-center">
                <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <input
                  className="flex-1 text-sm bg-background border border-input rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  placeholder="Email"
                  type="email"
                  value={editContact.email}
                  onChange={(event) => setEditContact((prev) => ({ ...prev, email: event.target.value }))}
                />
              </div>
              <div className="flex gap-2 items-center">
                <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <input
                  className="flex-1 text-sm bg-background border border-input rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  placeholder="Phone"
                  value={editContact.phone}
                  onChange={(event) => setEditContact((prev) => ({ ...prev, phone: event.target.value }))}
                />
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-2 items-center text-sm">
                <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span
                  className={
                    leadState.contactInfo.name ? 'font-medium' : 'text-muted-foreground italic'
                  }
                >
                  {leadState.contactInfo.name ?? 'Name not provided'}
                </span>
              </div>
              <div className="flex gap-2 items-center text-sm">
                <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className={leadState.contactInfo.email ? '' : 'text-muted-foreground italic'}>
                  {leadState.contactInfo.email ?? 'Email not captured'}
                </span>
              </div>
              <div className="flex gap-2 items-center text-sm">
                <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className={leadState.contactInfo.phone ? '' : 'text-muted-foreground italic'}>
                  {leadState.contactInfo.phone ?? 'Phone not provided'}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Qualification Fields */}
      {fieldEntries.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setFieldsExpanded((prev) => !prev)}
            className="flex justify-between items-center w-full text-xs font-medium tracking-wide uppercase transition-colors text-muted-foreground hover:text-foreground"
          >
            <span>
              Qualification Info ({filledCount}/{fieldEntries.length} collected)
            </span>
            {fieldsExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {fieldsExpanded && (
            <div className="pl-2 space-y-1.5 border-l-2 border-violet-500/20">
              {fieldEntries.map(([key, value]) => (
                <div key={key} className="flex gap-2 items-start text-sm">
                  {editing ? (
                    <>
                      <span className="text-muted-foreground shrink-0 pt-0.5">
                        {fieldLabel(key)}:
                      </span>
                      <input
                        className="flex-1 bg-background border border-input rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
                        placeholder="Not provided"
                        value={editFields[key] ?? ''}
                        onChange={(event) => setEditFields((prev) => ({ ...prev, [key]: event.target.value }))}
                      />
                    </>
                  ) : (
                    <>
                      <StatusIcon value={value !== null} />
                      <span>
                        <span className="text-muted-foreground">{fieldLabel(key)}:</span>{' '}
                        <span className={value ? 'font-medium' : 'italic text-muted-foreground'}>
                          {value ?? 'Not provided'}
                        </span>
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Files received indicator */}
      {filesReceived && (
        <div className="flex gap-2 items-center text-sm">
          <CheckCircle className="w-4 h-4 text-green-500" />
          <span>{filesCount ? `${filesCount} file(s) received` : 'Files received'}</span>
        </div>
      )}

      {/* Objections */}
      {leadState.objectionsRaised.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium tracking-wide uppercase text-muted-foreground">
            Objections
          </p>
          <div className="flex flex-wrap gap-1">
            {leadState.objectionsRaised.map((obj) => (
              <Badge
                key={obj}
                variant={leadState.objectionsAddressed.includes(obj) ? 'success' : 'warning'}
                className="text-xs"
              >
                {obj.replace(/_/g, ' ')}
                {leadState.objectionsAddressed.includes(obj) ? ' ✓' : ''}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
