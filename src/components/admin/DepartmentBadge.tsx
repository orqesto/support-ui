import React from 'react';

type DepartmentRole = 'support' | 'sales' | 'billing' | 'general' | 'hr';

type DepartmentBadgeProps = {
  department: DepartmentRole;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
};

const DepartmentBadge: React.FC<DepartmentBadgeProps> = ({
  department,
  showIcon = false,
  size = 'sm',
}) => {
  const config = {
    general: {
      label: 'General',
      colors:
        'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600',
      icon: '🌐',
    },
    support: {
      label: 'Support',
      colors:
        'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700',
      icon: '🛟',
    },
    sales: {
      label: 'Sales',
      colors:
        'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700',
      icon: '💼',
    },
    billing: {
      label: 'Billing',
      colors:
        'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700',
      icon: '💳',
    },
    hr: {
      label: 'HR',
      colors:
        'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700',
      icon: '👥',
    },
  };

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-1.5 text-base',
  };

  const { label, colors, icon } = config[department];

  return (
    <span
      className={`inline-flex gap-1 items-center font-medium rounded-full border ${colors} ${sizeClasses[size]}`}
      title={`Department: ${label}`}
    >
      {showIcon && <span>{icon}</span>}
      {label}
    </span>
  );
};

export default DepartmentBadge;
