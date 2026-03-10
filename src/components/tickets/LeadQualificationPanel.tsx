import {
  User,
  Phone,
  Mail,
  MapPin,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
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

type DrawingValidation = {
  isValidDrawing: boolean;
  hasFloorPlans: boolean;
  hasFloorPlanDimensions: boolean;
  hasFacades: boolean;
  facadeCount: number;
  hasSections: boolean;
  estimatedArea?: number;
  estimatedVolume?: number;
  missingElements: string[];
  validatedAt: string;
};

type LeadQualificationState = {
  stage: 'initial' | 'gathering_info' | 'awaiting_project' | 'validating_drawings' | 'qualified' | 'escalated';
  contactInfo: LeadContactInfo;
  hasLand: boolean | null;
  hasProject: boolean | null;
  projectFilesReceived: boolean;
  drawingValidation?: DrawingValidation;
  category: 'a' | 'b' | 'c' | 'd' | null;
  objectionsRaised: string[];
  objectionsAddressed: string[];
  turnCount: number;
  qualifiedAt?: string;
  updatedAt: string;
};

const STAGE_LABELS: Record<LeadQualificationState['stage'], string> = {
  initial: 'Initial Contact',
  gathering_info: 'Gathering Info',
  awaiting_project: 'Awaiting Drawings',
  validating_drawings: 'Validating Drawings',
  qualified: 'Qualified',
  escalated: 'Escalated',
};

const STAGE_COLORS: Record<LeadQualificationState['stage'], 'default' | 'secondary' | 'warning' | 'success' | 'danger'> = {
  initial: 'secondary',
  gathering_info: 'default',
  awaiting_project: 'warning',
  validating_drawings: 'warning',
  qualified: 'success',
  escalated: 'danger',
};

const CATEGORY_LABELS: Record<'a' | 'b' | 'c' | 'd', string> = {
  a: 'A — Has land + project',
  b: 'B — Has land, no project',
  c: 'C — No land, has project',
  d: 'D — No land, no project',
};

const CATEGORY_PRIORITY: Record<'a' | 'b' | 'c' | 'd', 'danger' | 'warning' | 'default' | 'secondary'> = {
  a: 'danger',
  b: 'warning',
  c: 'warning',
  d: 'secondary',
};

const StatusIcon = ({ value }: { value: boolean | null }) => {
  if (value === null) return <Clock className="w-4 h-4 text-muted-foreground" />;
  return value
    ? <CheckCircle className="w-4 h-4 text-green-500" />
    : <XCircle className="w-4 h-4 text-red-500" />;
};

type LeadQualificationPanelProps = {
  leadState: LeadQualificationState;
};

export const LeadQualificationPanel = ({ leadState }: LeadQualificationPanelProps) => {
  const [drawingExpanded, setDrawingExpanded] = useState(false);

  return (
    <div className="space-y-4 p-4 rounded-lg border border-violet-500/20 bg-violet-500/5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-violet-700 dark:text-violet-400">
          Lead Qualification
        </h3>
        <div className="flex items-center gap-2">
          <Badge variant={STAGE_COLORS[leadState.stage]}>
            {STAGE_LABELS[leadState.stage]}
          </Badge>
          {leadState.category && (
            <Badge variant={CATEGORY_PRIORITY[leadState.category]}>
              {CATEGORY_LABELS[leadState.category]}
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

      {/* Qualification Checklist */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Qualification</p>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm">
            <StatusIcon value={leadState.hasLand} />
            <span>
              Land:{' '}
              <span className="font-medium">
                {leadState.hasLand === null ? 'Unknown' : leadState.hasLand ? 'Has land' : 'No land'}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <StatusIcon value={leadState.hasProject} />
            <span>
              Project:{' '}
              <span className="font-medium">
                {leadState.hasProject === null ? 'Unknown' : leadState.hasProject ? 'Has project' : 'No project'}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <StatusIcon value={leadState.projectFilesReceived} />
            <span>Drawings received</span>
          </div>
        </div>
      </div>

      {/* Drawing Validation */}
      {leadState.drawingValidation && (
        <div className="space-y-2">
          <button
            onClick={() => setDrawingExpanded((prev) => !prev)}
            className="flex items-center justify-between w-full text-xs font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Drawing Validation
              {leadState.drawingValidation.isValidDrawing
                ? <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                : <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              }
            </div>
            {drawingExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {drawingExpanded && (
            <div className="pl-2 space-y-1.5 border-l-2 border-violet-500/20">
              {[
                { label: 'Floor plans', value: leadState.drawingValidation.hasFloorPlans },
                { label: 'Floor plan dimensions', value: leadState.drawingValidation.hasFloorPlanDimensions },
                { label: `Facades (${leadState.drawingValidation.facadeCount}/4)`, value: leadState.drawingValidation.facadeCount >= 4 },
                { label: 'Sections', value: leadState.drawingValidation.hasSections },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center gap-2 text-sm">
                  <StatusIcon value={value} />
                  <span>{label}</span>
                </div>
              ))}
              {leadState.drawingValidation.estimatedArea && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <span>Est. area: <strong>{leadState.drawingValidation.estimatedArea} m²</strong></span>
                </div>
              )}
              {leadState.drawingValidation.missingElements.length > 0 && (
                <div className="mt-2 p-2 rounded bg-amber-500/10 text-xs text-amber-700 dark:text-amber-400 space-y-0.5">
                  <p className="font-medium">Missing:</p>
                  {leadState.drawingValidation.missingElements.map((el) => (
                    <p key={el}>• {el}</p>
                  ))}
                </div>
              )}
            </div>
          )}
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
