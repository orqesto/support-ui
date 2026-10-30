import { Filter } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { MessageSourceFilter } from '@/components/messages/MessageSourceFilter';
import { KbStatusFilter, type KbFilterStatus } from '@/components/kb/KbStatusFilter';
import { KB_FINDINGS, type KbFinding } from '@/services/kb.service';

/** The findings in the words of the findings strip (D12). */
export const KB_FINDING_SHORT: Record<KbFinding, string> = {
  raw_email: 'Raw emails',
  awaiting_review: 'Awaiting review',
  customer_specific: 'Customer-specific',
  unclassified: 'Could not classify',
  no_clear_language: 'No clear language',
  detached: 'Detached from a case',
};

const NO_FINDING = 'any';

/** The "More filters" toggle: one of the five controls the page shows by default. */
export const KbMoreFiltersButton = ({
  open,
  onToggle,
  active,
}: {
  open: boolean;
  onToggle: () => void;
  /** How many of the filters inside are set. */
  active: number;
}) => (
  <div data-kb-filter="more">
    <Button variant="outline" size="sm" aria-expanded={open} onClick={onToggle}>
      <Filter className="mr-1 w-4 h-4" />
      More filters
      {active > 0 && (
        <Badge variant="default" className="ml-1 text-xs">
          {active}
        </Badge>
      )}
    </Button>
  </div>
);

/**
 * The filters behind "More filters": status (reviewers only: the server shows everyone else only
 * live entries), source and finding. A finding is counted per team, so it needs one team.
 */
export const KbMoreFilters = ({
  canReview,
  status,
  onStatus,
  autoChanged,
  source,
  onSource,
  finding,
  onFinding,
  findingTeamId,
}: {
  canReview: boolean;
  status: KbFilterStatus;
  onStatus: (next: KbFilterStatus) => void;
  autoChanged: boolean | null;
  source: string;
  onSource: (next: string) => void;
  finding: KbFinding | null;
  onFinding: (next: KbFinding | null) => void;
  /** The team a picked finding is for; null: none chosen, so a finding cannot be picked. */
  findingTeamId: number | null;
}) => (
  <section aria-label="More filters" className="flex flex-col gap-3 p-3 rounded-lg border">
    {canReview && <KbStatusFilter value={status} onChange={onStatus} autoChanged={autoChanged} />}
    <div className="flex flex-wrap gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Source</span>
        <MessageSourceFilter
          value={source}
          onChange={onSource}
          includeNoSource
          className="w-full sm:w-64"
        />
      </div>
      {canReview && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-muted-foreground">Finding</span>
          <Select
            aria-label="Filter by finding"
            size="sm"
            className="w-full sm:w-64"
            value={finding ?? NO_FINDING}
            disabled={findingTeamId === null && finding === null}
            hint={findingTeamId === null && finding === null ? 'Choose a team first' : undefined}
            onChange={(value) => onFinding(value === NO_FINDING ? null : (value as KbFinding))}
            options={[
              { value: NO_FINDING, label: 'Any finding' },
              ...KB_FINDINGS.map((reason) => ({ value: reason, label: KB_FINDING_SHORT[reason] })),
            ]}
          />
        </div>
      )}
    </div>
  </section>
);
