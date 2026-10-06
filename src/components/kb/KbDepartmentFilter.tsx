import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';

/**
 * Departments to report on: none ticked = every department the viewer can see (the default) —
 * and, when the server says so (`unassignedScopes`, org-level viewers), mailboxes linked to no
 * department too; ticking narrows to those. The page keeps the choice in the URL.
 */
export const KbDepartmentFilter = ({
  departments,
  selected,
  onChange,
  disabled = false,
  unassignedScopes = null,
}: {
  departments: { id: number; name: string }[];
  selected: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
  /** What "all" covered on the last report: true adds unlinked mailboxes; null = not known yet. */
  unassignedScopes?: boolean | null;
}) => (
  <fieldset className="min-w-0" disabled={disabled}>
    <legend className="mb-1 text-sm font-medium">Departments</legend>
    <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
      {departments.map((dept) => (
        <Checkbox
          key={dept.id}
          label={dept.name}
          checked={selected.includes(dept.id)}
          onChange={(event) =>
            onChange(
              event.target.checked
                ? departments
                    .map((candidate) => candidate.id)
                    .filter((id) => id === dept.id || selected.includes(id))
                : selected.filter((id) => id !== dept.id)
            )
          }
        />
      ))}
      {selected.length === 0 ? (
        <span className="text-xs text-muted-foreground" data-testid="departments-scope">
          {unassignedScopes === null
            ? 'No department filter'
            : unassignedScopes
              ? 'Showing every department, and mailboxes linked to no department'
              : 'Showing all departments you can see'}
        </span>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => onChange([])}>
          Clear the filter
        </Button>
      )}
    </div>
  </fieldset>
);
