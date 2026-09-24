import { AlertTriangle, Building2, GitBranch } from 'lucide-react';
import type { Department } from '@/types';
import { Tooltip } from '@/components/ui/Tooltip';
import { tintedChip } from '@/lib/userColor';

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
          className={`${baseChipClasses} border border-dashed border-border-strong text-foreground`}
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
        <span className={`${baseChipClasses} bg-primary-muted text-primary`}>
          <GitBranch className="w-2.5 h-2.5" />
          <span>{label ?? dept.name}</span>
        </span>
      </Tooltip>
    );
  }

  // Primary: dept-colored chip with a saturated dot, Building2 glyph, and the
  // dept's slug as the compact label. The ground is a ~13% tint of the dept's colour; the TEXT
  // is that colour made readable on it (userColor.ts) — the raw colour read at 1.94:1 for the
  // default Billing amber. The dot keeps the admin's exact colour.
  // A blank colour falls back to indigo like a missing one, as before.
  const chip = tintedChip(dept.color, 0.13, 'rgb(99,102,241)');
  return (
    <Tooltip content={tooltipContent} size="sm">
      <span className={`${baseChipClasses} border ${chip.className}`} style={chip.style}>
        <span
          aria-hidden="true"
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: 'var(--uc-dot)' }}
        />
        <Building2 className="w-2.5 h-2.5" />
        <span className="font-medium">{label ?? dept.slug}</span>
      </span>
    </Tooltip>
  );
};
