import React from 'react';
import { useDepartmentById } from '@/hooks/useDepartments';

type DepartmentBadgeProps = {
  /** Department FK. Pass null/undefined to render the no-dept variant. */
  departmentId: number | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  /**
   * What "no dept" means for this context. Defaults to 'unassigned' (legacy semantics:
   * a row that simply hasn't been linked to a dept yet, e.g. an integration before the
   * admin picks its dept). Pass 'baseline' for rule/category contexts where
   * departmentId=NULL is a deliberate marker that the row applies to every dept.
   */
  nullVariant?: 'unassigned' | 'baseline';
};

const sizeClasses = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
  lg: 'px-4 py-1.5 text-base',
};

const UNASSIGNED_COLORS =
  'bg-muted text-muted-foreground border-border';
const BASELINE_COLORS =
  'bg-sunken text-foreground border-border-strong';

/**
 * Convert a hex color (e.g. "#3b82f6") into a tailwind-compatible inline style pair —
 * subtle background + readable foreground. Falls back to neutral gray when unparseable.
 */
const colorStyle = (hex: string | null | undefined): React.CSSProperties => {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return {};
  // Subtle tinted background (~12% alpha) with the hex as the text color and full border.
  return {
    backgroundColor: `${hex}1f`,
    color: hex,
    borderColor: `${hex}66`,
  };
};

const DepartmentBadge: React.FC<DepartmentBadgeProps> = ({
  departmentId,
  size = 'sm',
  nullVariant = 'unassigned',
}) => {
  const dept = useDepartmentById(departmentId);

  if (!dept) {
    const isBaseline = nullVariant === 'baseline';
    return (
      <span
        className={`inline-flex gap-1 items-center font-medium rounded-full border ${
          isBaseline ? BASELINE_COLORS : UNASSIGNED_COLORS
        } ${sizeClasses[size]}`}
        title={
          isBaseline
            ? 'Baseline rule — applies to every department'
            : 'Department: Unassigned'
        }
      >
        {isBaseline ? 'Baseline' : 'Unassigned'}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex gap-1 items-center font-medium rounded-full border ${sizeClasses[size]}`}
      style={colorStyle(dept.color)}
      title={`Department: ${dept.name}`}
    >
      {dept.name}
    </span>
  );
};

export default DepartmentBadge;
