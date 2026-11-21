import { useId } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { RestrictedTopicTeam } from '@/types/api';

export const TOPICS_ADMIN_ONLY = 'Only a workspace admin can change restricted topics.';
export const OTHER_TEAM_TOPICS_TITLE = 'Topics kept for other teams';
export const OTHER_TEAM_TOPICS_HELP = "They still apply to each team's conversations.";
/** A deleted team has no name left: its id tells two of them apart. */
export const topicTeamName = (team: Pick<RestrictedTopicTeam, 'departmentId' | 'name'>): string =>
  team.name ?? `Deleted team #${team.departmentId}`;

/** `restrictedTopicTeams` as the page uses it: well-formed entries that still hold a topic. */
export const readTopicTeams = (value: unknown): RestrictedTopicTeam[] | null =>
  Array.isArray(value)
    ? (value as (Partial<RestrictedTopicTeam> | null)[])
        .filter(
          (team): team is RestrictedTopicTeam =>
            typeof team?.departmentId === 'number' && Array.isArray(team.restrictedTopics)
        )
        .map((team) => ({
          departmentId: team.departmentId,
          name: typeof team.name === 'string' && team.name !== '' ? team.name : null,
          active: team.active === true,
          restrictedTopics: team.restrictedTopics.filter(
            (topic): topic is string => typeof topic === 'string' && topic.trim() !== ''
          ),
        }))
        .filter((team) => team.restrictedTopics.length > 0)
    : null;

type Props = {
  /** Teams with stored topics that have no row of their own on the page. */
  teams: readonly RestrictedTopicTeam[];
  /** False: chips only (someone who is not a workspace admin). */
  canChange: boolean;
  /** Which rows have a save queued or in flight, by the team's id as text. */
  saving?: Record<string, boolean>;
  onRemove?: (departmentId: number, topic: string) => void;
};

/**
 * Stored topics of teams the page shows no row for — a switched-off or deleted team, or any team
 * while teams are off. The send gate keeps applying them, so they are always listed and can be
 * removed; nothing is added here (a topic is added in the team's own row).
 */
export const OtherTeamTopics = ({ teams, canChange, saving = {}, onRemove }: Props) => {
  const titleId = useId();
  if (teams.length === 0) return null;
  return (
    <div className="space-y-1">
      <h4 id={titleId} className="text-xs font-medium">
        {OTHER_TEAM_TOPICS_TITLE}
      </h4>
      <p className="text-[10px] text-muted-foreground">{OTHER_TEAM_TOPICS_HELP}</p>
      <ul aria-labelledby={titleId} className="space-y-1">
        {teams.map((team) => {
          const name = topicTeamName(team);
          return (
            <li key={team.departmentId} className="flex flex-wrap gap-1 items-center">
              <span className="text-xs text-muted-foreground">{name}</span>
              {team.name !== null && !team.active && (
                <Badge variant="outline" size="sm" className="font-normal">
                  Inactive
                </Badge>
              )}
              <ul aria-label={`${name} restricted topics`} className="flex flex-wrap gap-1">
                {team.restrictedTopics.map((topic) => (
                  <li key={topic}>
                    <Badge variant="warning" size="sm" className="gap-1 font-normal cursor-default">
                      {topic}
                      {canChange && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={saving[String(team.departmentId)] === true}
                          onClick={() => onRemove?.(team.departmentId, topic)}
                          aria-label={`Remove topic ${topic} from ${name}`}
                          className="p-0 w-auto h-auto hover:text-destructive data-[inactive]:opacity-50"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      )}
                    </Badge>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
