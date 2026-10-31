import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { usePermissions } from '@/hooks/usePermissions';
import type { KbEngineSummary, KbEngineWeekAction } from '@/services/kbEngine.types';
import { Permission } from '@/types/roles';
import { useKbTeams } from '../page/KbTeamFilter';
import { ENGINE_ACTION_LABEL } from './kbActivityCopy';
import { KbEngineChanges } from './KbEngineChanges';
import { KbEngineRollback } from './KbEngineRollback';
import { KbFindingsStrip } from './KbFindingsStrip';
import { KbRateEngine } from './KbRateEngine';

/** The digest line (§8): what the engine did this week. */
export const kbEngineDigest = (summary: KbEngineSummary): string =>
  `Engine did ${summary.week.actions} things this week, ${summary.week.undone} undone, ${summary.questions.open} questions for you`;

/** The killed line inside the panel; null when the engine may act. */
const killedText = (killed: KbEngineSummary['killed']): string | null => {
  if (killed.all) return 'The engine is switched off: it changes nothing by itself.';
  if (killed.actions.length === 0) return null;
  const names = killed.actions.map(
    (action) => ENGINE_ACTION_LABEL[action as KbEngineWeekAction] ?? action
  );
  return `Switched off: ${names.join(', ')}.`;
};

/**
 * KB engine Stage 1 (F5): Engine activity. The digest line and the findings counts are always
 * shown (both from the stored summary the page already read); the engine's changes, Rate the
 * engine and the window rollback appear when it is expanded, and only then read anything.
 * Collapsed under the question card; expanded on its own view tab.
 */
export const KbEngineActivity = ({
  summary,
  defaultExpanded,
  teamId,
  onChanged,
}: {
  summary: KbEngineSummary | null;
  defaultExpanded: boolean;
  /** The team picked on the page, if one. */
  teamId?: number;
  /** The engine's change was undone or rolled back: what the page shows may be stale. */
  onChanged?: () => void;
}) => {
  // A finding link needs a team: the one picked, else the viewer's teams.
  const teams = useKbTeams();
  // Workspace owner / admin only (the server checks it too).
  const { hasPermission, isOrgAdmin } = usePermissions();
  const canRollback = isOrgAdmin && hasPermission(Permission.MANAGE_KNOWLEDGE_BASE);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  // Remounted after a rollback so the change list re-reads.
  const [changesKey, setChangesKey] = useState(0);
  useEffect(() => setExpanded(defaultExpanded), [defaultExpanded]);
  const killed = summary ? killedText(summary.killed) : null;

  return (
    <Card data-testid="kb-engine-activity-slot" data-expanded={expanded}>
      <CardContent className="p-4 space-y-3">
        <Button
          variant="ghost"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className="flex flex-wrap gap-x-2 gap-y-1 justify-start items-center px-1 w-full h-auto text-left whitespace-normal"
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="w-4 h-4 shrink-0" aria-hidden="true" />
          )}
          <span className="font-semibold text-foreground">Engine activity</span>
          <span className="w-full text-sm font-normal text-muted-foreground sm:ml-auto sm:w-auto">
            {summary ? kbEngineDigest(summary) : 'Engine activity is not available right now.'}
          </span>
        </Button>
        <KbFindingsStrip summary={summary} teamId={teamId} teams={teams} />
        {expanded && (
          <div className="pt-3 space-y-4 border-t">
            {killed && (
              <Alert variant="warning" className="py-2 text-sm">
                {killed}
              </Alert>
            )}
            <KbEngineChanges key={changesKey} onUndone={onChanged} />
            <KbRateEngine />
            {canRollback &&
              (rollbackOpen ? (
                <KbEngineRollback
                  departmentId={teamId}
                  onRolledBack={() => {
                    setChangesKey((key) => key + 1);
                    onChanged?.();
                  }}
                />
              ) : (
                <Button variant="outline" size="sm" onClick={() => setRollbackOpen(true)}>
                  Roll back a period…
                </Button>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
