import { Target } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';

/** The page heading of Lead Qualification settings. */
export const LeadSettingsHeader = () => (
  <div className="flex items-center gap-3">
    <div className="p-2 rounded-lg bg-muted">
      <Target className="w-5 h-5 text-muted-foreground" />
    </div>
    <div>
      <h2 className="font-display text-lg font-semibold">Lead Qualification</h2>
      <p className="text-sm text-muted-foreground">
        Configure multi-turn AI lead qualification — which departments use it, what to collect, and
        how to categorize leads.
      </p>
    </div>
  </div>
);

/**
 * Opted-in departments that were deleted (`lead-config.missingDepartmentIds`, 2026-10-21): the
 * gate compares against an id nothing has any more, so lead qualification silently never runs for
 * them. Renders nothing when the list is empty or absent (older backend).
 */
export const LeadMissingDepartmentsWarning = ({ ids }: { ids?: number[] }) =>
  ids && ids.length > 0 ? (
    <div data-testid="lead-missing-departments">
      <Alert variant="warning">
        These departments were deleted — lead qualification doesn't run for them:{' '}
        {ids.map((id) => `#${id}`).join(', ')}. Opt in an existing department below and save.
      </Alert>
    </div>
  ) : null;
