import { Loader2 } from 'lucide-react';
import { Select, type Option } from '@/components/ui/Select';
import type { Department } from '@/services/department.service';

type Props = {
  allDepts: Department[];
  selected: number[];
  defaultId: number | undefined;
  loading?: boolean;
  onSelectedChange: (next: number[]) => void;
  onDefaultChange: (id: number | undefined) => void;
};

export const DepartmentMultiPicker = ({
  allDepts,
  selected,
  defaultId,
  loading,
  onSelectedChange,
  onDefaultChange,
}: Props) => {
  /*
    The Select reports the whole ticked set; rebuild `next` the way the old toggle row did —
    the existing order kept, a newly ticked department appended — so "first remaining" (the
    fallback default below) names the same department it always did. Ids the list does not
    offer (not in `allDepts`) are left alone, never dropped by a tick elsewhere.
  */
  const offered = new Set(allDepts.map((dept) => dept.id));
  const handleChange = (values: string[]) => {
    const ticked = values.map(Number);
    const kept = selected.filter((id) => !offered.has(id) || ticked.includes(id));
    const added = ticked.filter((id) => !selected.includes(id));
    const next = [...kept, ...added];
    onSelectedChange(next);
    const removed = selected.filter((id) => !next.includes(id));
    // If the current default got deselected, pick a new one (first remaining, or undefined).
    if (defaultId !== undefined && removed.includes(defaultId)) {
      onDefaultChange(next[0]);
    } else if (defaultId === undefined && next.length > 0) {
      onDefaultChange(next[0]);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading departments…
      </div>
    );
  }

  const options: Option[] = allDepts.map((dept) => ({
    value: String(dept.id),
    // The chip of the default department says so, as the old toggle did; the menu row does not.
    label: dept.id === defaultId && selected.includes(dept.id) ? `${dept.name} (default)` : dept.name,
    menuLabel: dept.name,
  }));
  const defaultOptions: Option[] = selected.flatMap((id) => {
    const dept = allDepts.find((dep) => dep.id === id);
    return dept ? [{ value: String(id), label: dept.name }] : [];
  });

  return (
    <>
      <Select
        multi
        aria-label="Departments"
        placeholder="Choose departments…"
        options={options}
        value={selected.map(String)}
        onChange={handleChange}
      />

      {selected.length > 1 && (
        <div className="mt-3">
          <Select
            label="Default department"
            options={defaultOptions}
            value={defaultId !== undefined ? String(defaultId) : ''}
            onChange={(value) => onDefaultChange(Number(value))}
          />
        </div>
      )}
    </>
  );
};
