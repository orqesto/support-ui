import { useState, useEffect } from 'react';
import { Building2, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { departmentService, type Department } from '@/services/department.service';
import { integrationsService } from '@/services/integrations.service';
import { logger } from '@/lib/logger';
import { DepartmentMultiPicker } from './DepartmentMultiPicker';

type Props = {
  sourceId: number;
  onClose: () => void;
  onSaved: () => void;
};

export const SourceDepartmentEditor = ({ sourceId, onClose, onSaved }: Props) => {
  const [allDepts, setAllDepts] = useState<Department[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [defaultId, setDefaultId] = useState<number | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [depts, assignments] = await Promise.all([
          departmentService.getAll(),
          integrationsService.getSourceDepartments(sourceId),
        ]);
        setAllDepts(depts);
        if (assignments.success && assignments.data) {
          setSelected(assignments.data.map((assignment) => assignment.departmentId));
          const def = assignments.data.find((assignment) => assignment.isDefault);
          if (def) setDefaultId(def.departmentId);
        }
      } catch (err) {
        logger.error('Failed to load departments:', err);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [sourceId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await integrationsService.setSourceDepartments(sourceId, selected, defaultId);
      onSaved();
    } catch (err) {
      logger.error('Failed to save departments:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 p-3 rounded-lg border bg-muted/30">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium flex items-center gap-1">
          <Building2 className="w-3.5 h-3.5" /> Assign Departments
        </span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      <DepartmentMultiPicker
        allDepts={allDepts}
        selected={selected}
        defaultId={defaultId}
        loading={loading}
        onSelectedChange={setSelected}
        onDefaultChange={setDefaultId}
      />

      {!loading && (
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
            {saving && <Loader2 className="mr-1 w-3 h-3 animate-spin" />}
            Save
          </Button>
        </div>
      )}
    </div>
  );
};
