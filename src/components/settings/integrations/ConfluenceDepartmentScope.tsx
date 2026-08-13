import { Check } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { useDepartments } from '@/hooks/useDepartments';

type Props = {
  /** Current config value: undefined = unset, [] = org-wide, [ids] = scoped. */
  value: number[] | undefined;
  onChange: (departmentIds: number[]) => void;
  /** The connecting admin's own department ids — the default scope for a new source. */
  seedDeptIds: number[];
  /** True on a new connect (seed to admin's depts); false on edit (legacy = keep org-wide). */
  isCreate: boolean;
};

/**
 * Department visibility for Confluence-synced pages. Semantics match the BE:
 * `[]` = org-wide (every department's AI can cite the pages), `[ids]` = scoped.
 *
 * Seeds itself once on mount when the value is unset, so a NEW connect defaults to the
 * admin's own department(s) and an edit of a legacy (never-scoped) source defaults to
 * org-wide — preserving its current behaviour. Seeding here (not in the parent) keeps
 * the initial toggle state and the seeded value in sync with no first-render flash.
 */
export const ConfluenceDepartmentScope = ({ value, onChange, seedDeptIds, isCreate }: Props) => {
  const { data: departments = [], isLoading } = useDepartments();

  useEffect(() => {
    if (value === undefined) onChange(isCreate ? seedDeptIds : []);
    // Seed exactly once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = value ?? (isCreate ? seedDeptIds : []);
  const orgWide = selected.length === 0;

  const toggleDept = (id: number) => {
    onChange(selected.includes(id) ? selected.filter((deptId) => deptId !== id) : [...selected, id]);
  };

  const enterScoped = () => {
    // Pre-select the admin's depts (or all, if they have none) so scoped mode is never
    // empty on entry — an empty selection collapses back to org-wide.
    if (selected.length > 0) return;
    onChange(seedDeptIds.length > 0 ? seedDeptIds : departments.map((dept) => dept.id));
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Department visibility</span>
      <div className="flex w-fit rounded-md shadow-sm">
        <Button
          type="button"
          variant={orgWide ? 'primary' : 'outline'}
          size="sm"
          onClick={() => onChange([])}
          className="rounded-r-none border-r-0 text-xs"
        >
          All departments
        </Button>
        <Button
          type="button"
          variant={!orgWide ? 'primary' : 'outline'}
          size="sm"
          onClick={enterScoped}
          className="rounded-l-none text-xs"
        >
          Specific departments
        </Button>
      </div>

      {orgWide ? (
        <p className="text-xs text-muted-foreground">
          Synced pages are visible to every department&apos;s AI.
        </p>
      ) : isLoading ? (
        <p className="text-xs text-muted-foreground">Loading departments…</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {departments.map((dept) => {
              const isSelected = selected.includes(dept.id);
              return (
                <Button
                  key={dept.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => toggleDept(dept.id)}
                  className={`h-auto items-center gap-1 px-2 py-1 text-xs ${
                    isSelected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border hover:bg-accent'
                  }`}
                >
                  {isSelected && <Check className="h-3 w-3" />}
                  {dept.name}
                </Button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Only the selected departments&apos; AI can use these pages.
          </p>
        </>
      )}
    </div>
  );
};
