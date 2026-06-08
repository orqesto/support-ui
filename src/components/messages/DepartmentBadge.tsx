import { AlertTriangle, Building2, GitBranch } from 'lucide-react';
import type { Department } from '@/types';
import { Tooltip } from '@/components/ui/Tooltip';
import { safeCssColor } from '@/lib/utils';

/**
 * Compact dept chip used in inbox list + kanban cards. Renders one of three
 * visual variants:
 *   - "primary"     — the routed-to dept; colored dot + lowercase slug
 *   - "needs"       — conv stuck at the placeholder dept; amber chip
 *   - "near-miss"   — runner-up dept from routing engine; muted blue chip
 *
 * All variants share the same hover tooltip surface, which carries the
 * human-readable details (name, slug, description) that the compact chip
 * itself elides to save horizontal space on dense rows.
 */

type Variant = 'primary' | 'needs' | 'near-miss';

type Props = {
  /** Variant-shaped data. For `needs` no dept is required. */
  variant: Variant;
  dept?: Department;
  /** Optional override of the rendered label. Defaults to slug for primary,
   * dept name for near-miss, "Needs routing" for needs. */
  label?: string;
};

const baseChipClasses =
  'inline-flex gap-1 items-center px-1.5 py-0.5 text-[10px] font-medium rounded';

const renderTooltipContent = (variant: Variant, dept?: Department): React.ReactNode => {
  if (variant === 'needs') {
    return (
      <div className="space-y-0.5 text-left">
        <p className="font-semibold">Needs routing</p>
        <p className="text-[11px] opacity-80">
          The routing engine found no decisive signal. Awaiting manual triage.
        </p>
      </div>
    );
  }
  if (!dept) return null;
  return (
    <div className="space-y-0.5 text-left">
      <p className="font-semibold">{dept.name}</p>
      <p className="font-mono text-[11px] opacity-70">slug: {dept.slug}</p>
      {dept.description && (
        <p className="text-[11px] opacity-80 max-w-[220px] line-clamp-3">{dept.description}</p>
      )}
      <p className="text-[10px] opacity-60">
        {variant === 'primary' ? 'Routed here' : 'Considered as alternative'}
      </p>
    </div>
  );
};

export const DepartmentBadge = ({ variant, dept, label }: Props) => {
  const tooltipContent = renderTooltipContent(variant, dept);

  if (variant === 'needs') {
    return (
      <Tooltip content={tooltipContent} size="sm">
        <span
          className={`${baseChipClasses} bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200`}
        >
          <AlertTriangle className="w-2.5 h-2.5" />
          <span>{label ?? 'Needs routing'}</span>
        </span>
      </Tooltip>
    );
  }

  if (!dept) return null;

  if (variant === 'near-miss') {
    return (
      <Tooltip content={tooltipContent} size="sm">
        <span
          className={`${baseChipClasses} bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-200`}
        >
          <GitBranch className="w-2.5 h-2.5" />
          <span>{label ?? dept.name}</span>
        </span>
      </Tooltip>
    );
  }

  // Primary: dept-colored chip with a saturated dot, Building2 glyph, and the
  // dept's slug as the compact label. Using the dept's color as a low-alpha
  // background (~22 = 13% alpha) and full-saturation foreground keeps the
  // chip readable against every kanban column theme while remaining clearly
  // distinguishable from the assignee/category chips that surround it.
  const dotColor = dept.color ? safeCssColor(dept.color) : 'rgb(99,102,241)';
  return (
    <Tooltip content={tooltipContent} size="sm">
      <span
        className={baseChipClasses}
        style={{
          backgroundColor: dept.color ? `${safeCssColor(dept.color)}22` : 'rgba(99,102,241,0.13)',
          color: dotColor,
          border: `1px solid ${dotColor}33`,
        }}
      >
        <span
          aria-hidden="true"
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: dotColor }}
        />
        <Building2 className="w-2.5 h-2.5" />
        <span className="font-medium">{label ?? dept.slug}</span>
      </span>
    </Tooltip>
  );
};
