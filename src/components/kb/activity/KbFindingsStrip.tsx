import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Menu, MenuItem } from '@/components/ui/Menu';
import {
  KB_ENGINE_FINDING_REASONS,
  type KbEngineFindingReason,
  type KbEngineSummary,
} from '@/services/kbEngine.types';
import { FINDING_CHIP_LABEL } from './kbActivityCopy';

export type KbTeam = { id: number; name: string };

/**
 * Live answers narrowed to one finding of one team, listing every status ('all'), so the list's
 * count can match the chip. The chip counts the teams the viewer may decide, summed: the list is
 * one team's, so the two need not be equal.
 */
export const kbFindingListHref = (reason: KbEngineFindingReason, departmentId: number): string =>
  `/knowledge-base?view=live&status=all&finding=${reason}&departmentId=${departmentId}#qa_pair`;

const chipText = (reason: KbEngineFindingReason, count: number) =>
  `${count} ${FINDING_CHIP_LABEL[reason]}`;

const asOfText = (iso: string | null): string => {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : `as of ${date.toLocaleString()}`;
};

/**
 * The six finding counts from the stored summary (D12), each opening Live answers on that
 * finding. A finding is per team: with one team (picked, or the viewer's only one) the chip is a
 * link; with several, it opens a team menu. Never computed yet: no counts at all.
 */
export const KbFindingsStrip = ({
  summary,
  teamId,
  teams,
}: {
  summary: KbEngineSummary | null;
  /** The team picked on the page, if one. */
  teamId?: number;
  /** The teams the viewer may pick (a finding link needs one). */
  teams: KbTeam[];
}) => {
  const navigate = useNavigate();
  if (!summary) return null;
  const findings = summary.findings;
  if (!findings) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="kb-findings-strip">
        Findings not computed yet: the engine counts them on its nightly run.
      </p>
    );
  }
  const oneTeam = teamId ?? (teams.length === 1 ? teams[0].id : undefined);
  return (
    <div className="flex flex-wrap gap-2 items-center" data-testid="kb-findings-strip">
      {KB_ENGINE_FINDING_REASONS.map((reason) => {
        const text = chipText(reason, findings[reason] ?? 0);
        if (oneTeam !== undefined)
          return (
            <Link key={reason} to={kbFindingListHref(reason, oneTeam)} aria-label={text}>
              <Badge variant="secondary">{text}</Badge>
            </Link>
          );
        if (teams.length === 0)
          return (
            <Badge key={reason} variant="secondary">
              {text}
            </Badge>
          );
        return (
          <Menu
            key={reason}
            ariaLabel={`Team for ${FINDING_CHIP_LABEL[reason]}`}
            trigger={({ toggle }) => (
              <Button
                variant="ghost"
                size="sm"
                className="p-0 h-auto"
                aria-label={`${text}: choose a team`}
                onClick={toggle}
              >
                <Badge variant="secondary">{text}</Badge>
              </Button>
            )}
          >
            {teams.map((team) => (
              <MenuItem key={team.id} onSelect={() => navigate(kbFindingListHref(reason, team.id))}>
                {team.name}
              </MenuItem>
            ))}
          </Menu>
        );
      })}
      {summary.findingsComputedAt && (
        <span className="text-xs text-muted-foreground">
          {asOfText(summary.findingsComputedAt)}
        </span>
      )}
    </div>
  );
};
