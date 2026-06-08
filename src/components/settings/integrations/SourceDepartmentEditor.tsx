import { useState, useEffect, useCallback } from 'react';
import { Building2, X, Loader2, MessageCircleReply, MessageCircleOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { departmentService, type Department } from '@/services/department.service';
import {
  integrationsService,
  type SourceDepartmentLink,
} from '@/services/integrations.service';
import { logger } from '@/lib/logger';
import { DepartmentMultiPicker } from '@/components/shared/DepartmentMultiPicker';

type Props = {
  sourceId: number;
  onClose: () => void;
  onSaved: () => void;
};

export const SourceDepartmentEditor = ({ sourceId, onClose, onSaved }: Props) => {
  const [allDepts, setAllDepts] = useState<Department[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [defaultId, setDefaultId] = useState<number | undefined>();
  const [links, setLinks] = useState<SourceDepartmentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingLinkId, setTogglingLinkId] = useState<number | null>(null);

  // Refresh the link list only (used after per-link PATCH) — does NOT touch
  // `selected` or `defaultId` so any unsaved picker edits are preserved.
  const refreshLinks = useCallback(async () => {
    const assignments = await integrationsService.getSourceDepartments(sourceId);
    if (assignments.success && assignments.data) {
      setLinks(assignments.data);
    }
  }, [sourceId]);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        const [depts, assignments] = await Promise.all([
          departmentService.getAll(),
          integrationsService.getSourceDepartments(sourceId),
        ]);
        if (ignore) return;
        setAllDepts(depts);
        if (assignments.success && assignments.data) {
          setLinks(assignments.data);
          setSelected(assignments.data.map((assignment) => assignment.departmentId));
          const def = assignments.data.find((assignment) => assignment.isDefault);
          setDefaultId(def?.departmentId);
        }
      } catch (err) {
        logger.error('Failed to load departments:', err);
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    void load();
    return () => {
      ignore = true;
    };
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

  const handleToggleAutoReply = async (link: SourceDepartmentLink) => {
    setTogglingLinkId(link.id);
    try {
      await integrationsService.updateSourceDepartmentLink(sourceId, link.id, {
        autoReplyEnabled: !link.autoReplyEnabled,
      });
      await refreshLinks();
    } catch (err) {
      logger.error('Failed to toggle auto-reply:', err);
    } finally {
      setTogglingLinkId(null);
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

      {!loading && links.some((link) => selected.includes(link.departmentId)) && (
        <div className="mt-4 pt-3 border-t border-border/60">
          <p className="text-xs text-muted-foreground mb-2">Auto-reply per department:</p>
          <div className="flex flex-col gap-1.5">
            {links
              .filter((link) => selected.includes(link.departmentId))
              .map((link) => {
              const isToggling = togglingLinkId === link.id;
              return (
                <div
                  key={link.id}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 rounded border border-border/60 bg-background"
                >
                  <span className="text-xs">
                    {link.name}
                    {link.isDefault && (
                      <span className="ml-1.5 text-muted-foreground">(default)</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleToggleAutoReply(link)}
                    disabled={isToggling}
                    className="inline-flex gap-1 items-center text-xs transition-colors hover:text-primary disabled:opacity-50"
                    title={
                      link.autoReplyEnabled
                        ? 'Auto-reply enabled — click to disable'
                        : 'Auto-reply disabled — click to enable'
                    }
                  >
                    {isToggling ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : link.autoReplyEnabled ? (
                      <>
                        <MessageCircleReply className="w-3.5 h-3.5 text-green-600" />
                        <span className="text-green-600">Auto-reply on</span>
                      </>
                    ) : (
                      <>
                        <MessageCircleOff className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">Auto-reply off</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
