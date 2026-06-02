import React from 'react';
import { useDepartmentById } from '@/hooks/useDepartments';

type DepartmentBadgeProps = {
  /** Department FK. Pass null/undefined to render an "Unassigned" badge. */
  departmentId: number | null | undefined;
  size?: 'sm' | 'md' | 'lg';
};

const sizeClasses = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
  lg: 'px-4 py-1.5 text-base',
};

const UNASSIGNED_COLORS =
  'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600';

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

const DepartmentBadge: React.FC<DepartmentBadgeProps> = ({ departmentId, size = 'sm' }) => {
  const dept = useDepartmentById(departmentId);

  if (!dept) {
    return (
      <span
        className={`inline-flex gap-1 items-center font-medium rounded-full border ${UNASSIGNED_COLORS} ${sizeClasses[size]}`}
        title="Department: Unassigned"
      >
        Unassigned
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
