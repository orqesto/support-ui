import {
  User,
  Phone,
  Mail,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';

type LeadContactInfo = {
  name?: string;
  email?: string;
  phone?: string;
  isComplete: boolean;
};

type LeadQualificationState = {
  stage: string;
  contactInfo: LeadContactInfo;
  qualificationFields: Record<string, string | null>;
  category: string | null;
  objectionsRaised: string[];
  objectionsAddressed: string[];
  turnCount: number;
  qualifiedAt?: string;
  updatedAt: string;
};

const STAGE_COLORS: Record<string, 'default' | 'secondary' | 'warning' | 'success' | 'danger'> = {
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
  stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const StatusIcon = ({ value }: { value: boolean | null }) => {
  if (value === null) return <Clock className="w-4 h-4 text-muted-foreground" />;
  return value
    ? <CheckCircle className="w-4 h-4 text-green-500" />
    : <XCircle className="w-4 h-4 text-red-500" />;
};

type FieldDef = { key: string; label: string };

type LeadEnrichment = {
  detectedCategory?: string;
  routingAttributes?: { lang?: string };
};

type LeadQualificationPanelProps = {
  leadState: LeadQualificationState;
  fieldDefs?: FieldDef[];
  enrichment?: LeadEnrichment;
};

export const LeadQualificationPanel = ({ leadState, fieldDefs, enrichment }: LeadQualificationPanelProps) => {
  const fieldLabel = (key: string): string =>
    fieldDefs?.find((f) => f.key === key)?.label ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const [fieldsExpanded, setFieldsExpanded] = useState(false);

  const fieldEntries = Object.entries(leadState.qualificationFields).filter(
    ([key]) => !['files_received', 'files_count'].includes(key)
  );
  const filesReceived = leadState.qualificationFields['files_received'] === 'true';
  const filesCount = leadState.qualificationFields['files_count'];

  return (
    <div className="space-y-4 p-4 rounded-lg border border-violet-500/20 bg-violet-500/5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-violet-700 dark:text-violet-400">
          Lead Qualification
        </h3>
        <div className="flex items-center gap-2">
          <Badge variant={stageColor(leadState.stage)}>
            {stageLabel(leadState.stage)}
          </Badge>
          {leadState.category && (
            <Badge variant="default">
              {leadState.category.toUpperCase()}
            </Badge>
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
        </div>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contact</p>
        <div className="grid grid-cols-1 gap-1.5">
          <div className="flex items-center gap-2 text-sm">
            <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className={leadState.contactInfo.name ? 'font-medium' : 'text-muted-foreground italic'}>
              {leadState.contactInfo.name ?? 'Name not provided'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className={leadState.contactInfo.email ? '' : 'text-muted-foreground italic'}>
              {leadState.contactInfo.email ?? 'Email not captured'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className={leadState.contactInfo.phone ? '' : 'text-muted-foreground italic'}>
              {leadState.contactInfo.phone ?? 'Phone not provided'}
            </span>
          </div>
        </div>
      </div>

      {/* Qualification Fields */}
      {fieldEntries.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setFieldsExpanded((prev) => !prev)}
            className="flex items-center justify-between w-full text-xs font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
          >
            <span>Qualification Info ({fieldEntries.length} fields)</span>
            {fieldsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {fieldsExpanded && (
            <div className="pl-2 space-y-1.5 border-l-2 border-violet-500/20">
              {fieldEntries.map(([key, value]) => (
                <div key={key} className="flex items-start gap-2 text-sm">
                  <StatusIcon value={value !== null} />
                  <span>
                    <span className="text-muted-foreground">{fieldLabel(key)}:</span>{' '}
                    <span className={value ? 'font-medium' : 'text-muted-foreground italic'}>
                      {value ?? 'Not provided'}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Files received indicator */}
      {filesReceived && (
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle className="w-4 h-4 text-green-500" />
          <span>
            {filesCount ? `${filesCount} file(s) received` : 'Files received'}
          </span>
        </div>
      )}

      {/* Objections */}
      {leadState.objectionsRaised.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Objections</p>
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
