import { Tag } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

/**
 * One member's routing skills as chips, one per key: `payment_sys: usdt, btc` (owner 2026-11-09).
 * `skills` undefined = not known (loading, failed, older backend): nothing is rendered.
 */
export const MemberSkillChips = ({
  skills,
  onEdit,
}: {
  skills: Record<string, string[]> | null | undefined;
  /** Shows the "Manage skills" button (skill managers only). */
  onEdit?: () => void;
}) => {
  const edit = onEdit && (
    <Button
      size="sm"
      variant="outline"
      className="flex-shrink-0"
      onClick={onEdit}
      title="Manage skills"
      aria-label="Manage skills"
    >
      <Tag className="w-4 h-4" />
    </Button>
  );
  if (skills === undefined || skills === null) return edit ?? null;
  const keys = Object.keys(skills)
    .filter((key) => skills[key].length > 0)
    .sort((left, right) => left.localeCompare(right));
  return (
    <div className="flex gap-2 items-start">
      {keys.length === 0 ? (
        <span className="text-xs text-muted-foreground">No skills</span>
      ) : (
        <div className="flex flex-wrap gap-1">
          {keys.map((key) => (
            <Badge key={key} variant="secondary" className="font-mono text-xs">
              {key}: {skills[key].join(', ')}
            </Badge>
          ))}
        </div>
      )}
      {edit}
    </div>
  );
};
