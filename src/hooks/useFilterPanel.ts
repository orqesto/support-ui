import { useState, useMemo } from 'react';

type ActiveFilter = {
  key: string;
  label: string;
  value: string;
};

type UseFilterPanelOptions<T extends Record<string, unknown>> = {
  filters: T;
  excludeKeys?: string[];
  customLabels?: Record<string, string>;
  customValues?: Record<string, (value: unknown) => string>;
};

export const useFilterPanel = <T extends Record<string, unknown>>({
  filters,
  excludeKeys = [],
  customLabels = {},
  customValues = {},
}: UseFilterPanelOptions<T>) => {
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const toggleAdvancedFilters = () => setShowAdvancedFilters((prev) => !prev);

  // Calculate active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    for (const [key, value] of Object.entries(filters)) {
      if (excludeKeys.includes(key)) continue;

      // Check if filter is active (not default/empty)
      if (
        value !== 'all' &&
        value !== '' &&
        value !== null &&
        value !== undefined &&
        value !== false
      ) {
        // For arrays, check if not empty
        if (Array.isArray(value) && value.length === 0) continue;
        count++;
      }
    }
    return count;
  }, [filters, excludeKeys]);

  // Get active filters as labeled objects
  const activeFilters = useMemo(() => {
    const active: ActiveFilter[] = [];

    for (const [key, value] of Object.entries(filters)) {
      if (excludeKeys.includes(key)) continue;

      // Check if filter is active
      if (
        value !== 'all' &&
        value !== '' &&
        value !== null &&
        value !== undefined &&
        value !== false
      ) {
        // For arrays, check if not empty
        if (Array.isArray(value) && value.length === 0) continue;

        // Get custom label or capitalize key
        const label =
          customLabels[key] ??
          key
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, (str) => str.toUpperCase())
            .trim();

        // Get custom value formatter or use string conversion
        const displayValue = customValues[key]
          ? customValues[key](value)
          : typeof value === 'boolean'
            ? 'Yes'
            : typeof value === 'string' || typeof value === 'number'
              ? String(value)
              : JSON.stringify(value);

        active.push({ key, label, value: displayValue });
      }
    }

    return active;
  }, [filters, excludeKeys, customLabels, customValues]);

  return {
    showAdvancedFilters,
    setShowAdvancedFilters,
    toggleAdvancedFilters,
    activeFilterCount,
    activeFilters,
  };
};
