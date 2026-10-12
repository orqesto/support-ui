import { capWarnings } from './tokenLimits.helpers';

/**
 * Spec §3's warnings under a monthly limit field: below the daily limit in force, or above the
 * workspace's alliance pool. Said, never blocking — such a limit may be meant.
 */
export const CapWarnings = ({
  value,
  daily,
  poolMonthly,
}: {
  value: number | null;
  daily?: number;
  poolMonthly?: number;
}) => (
  <>
    {capWarnings(value, daily, poolMonthly).map((warning) => (
      <span key={warning} className="text-xs text-warning">
        {warning}
      </span>
    ))}
  </>
);
