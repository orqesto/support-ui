import { Alert } from '@/components/ui/Alert';
import type { ApplyResult } from '../../services/teamBuilder.service';
import { NEW_TEAM_NOTICE_TEXT, NO_ROUTING_RULES_TEXT, TEAM_FLOW_LABELS } from './teamLabels';

const FAILURE_REASONS: Record<string, string> = {
  MISSING_ITEM: 'no longer in the library',
  CAPABILITY_ITEM: 'a role, not a rule',
  WORKSPACE_WIDE_ITEM: 'applies to the whole workspace, not one team',
  EMBEDDING_UNAVAILABLE: 'could not be prepared; try again later',
  UNSAFE_PATTERN: 'its pattern is unsafe',
};
const failureReason = (code: string): string => FAILURE_REASONS[code] ?? 'could not be added';

const NOTICE_TEXTS: Record<string, string> = { rules_only_until_traffic: NEW_TEAM_NOTICE_TEXT };
const WARNING_TEXTS: Record<string, string> = { NO_ROUTING_RULES: NO_ROUTING_RULES_TEXT };

type Props = { result: ApplyResult; notice?: string | null; warnings?: string[] };

/** What an apply did: counts, each item that failed with its reason, the notice and warnings. */
export const ApplyResultSummary = ({ result, notice, warnings }: Props) => (
  <div className="space-y-2" data-testid="apply-result-summary">
    <Alert variant={result.failed.length > 0 ? 'warning' : 'success'} role="status">
      <p>
        {result.inserted} {result.inserted === 1 ? 'rule' : 'rules'} added
      </p>
      {result.alreadyPresent > 0 && <p>{result.alreadyPresent} were already on this team</p>}
      {result.retired > 0 && <p>{result.retired} were archived in the library and left out</p>}
      {result.failed.length > 0 && (
        <ul className="mt-1 list-disc pl-5">
          {result.failed.map((item) => (
            <li key={`${item.flow}-${item.name}-${item.code}`}>
              {item.name} ({TEAM_FLOW_LABELS[item.flow] ?? item.flow}): {failureReason(item.code)}
            </li>
          ))}
        </ul>
      )}
    </Alert>
    {notice && (
      <Alert variant="info" role="status">
        {NOTICE_TEXTS[notice] ?? notice}
      </Alert>
    )}
    {(warnings ?? []).map((warning) => (
      <Alert key={warning} variant="warning" role="status">
        {WARNING_TEXTS[warning] ?? warning}
      </Alert>
    ))}
  </div>
);
