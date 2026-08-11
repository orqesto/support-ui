import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
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
  const toggle = (id: number) => {
    const next = selected.includes(id)
      ? selected.filter((item) => item !== id)
      : [...selected, id];
    onSelectedChange(next);
    // If the current default got deselected, pick a new one (first remaining, or undefined).
    if (defaultId === id && !next.includes(id)) {
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

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {allDepts.map((dept) => {
          const isSelected = selected.includes(dept.id);
          const isDefault = dept.id === defaultId;
          return (
            <Button
              key={dept.id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => toggle(dept.id)}
              className={`gap-1 items-center px-2 py-1 h-auto text-xs ${
                isSelected
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:bg-accent'
              }`}
            >
              {isSelected && <Check className="w-3 h-3" />}
              {dept.name}
              {isDefault && isSelected && (
                <span className="ml-0.5 opacity-70">(default)</span>
              )}
            </Button>
          );
        })}
      </div>

      {selected.length > 1 && (
        <div className="mt-3">
          <p className="text-xs text-muted-foreground mb-1">Default department:</p>
          <div className="flex flex-wrap gap-1">
            {selected.map((id) => {
              const dept = allDepts.find((dep) => dep.id === id);
              if (!dept) return null;
              return (
                <Button
                  key={id}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onDefaultChange(id)}
                  className={`px-2 py-0.5 h-auto text-xs ${
                    id === defaultId
                      ? 'bg-primary/20 border-primary text-primary'
                      : 'border-border hover:bg-accent'
                  }`}
                >
                  {dept.name}
                </Button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
};
