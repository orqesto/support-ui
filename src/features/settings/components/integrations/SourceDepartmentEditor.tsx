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
import { useAiDraftsOff } from '@/features/settings/hooks/useAiDraftsOff';
import { deriveTeamsEnabled } from '@/hooks/useTeamsEnabled';

/**
 * Which channel the editor serves: its automatic-replies switch means something different on each.
 * `none` (Slack, WhatsApp): nothing on those channels replies on its own, so the switch is hidden
 * and only the team picker remains.
 */
export type SourceAutoReplyKind = 'mailbox' | 'telegram' | 'none';

type Props = {
  sourceId: number;
  onClose: () => void;
  onSaved: () => void;
  autoReply?: SourceAutoReplyKind;
};

/** What the channel's switch stops and what it does not (the backend's reply gates). */
const SWITCH_HELP =
  'Mailbox: stops keyword rules and AI replies for this mailbox, the AI\'s missing-info email ' +
  'included. They also need Settings → AI → Auto-reply switched on. Telegram: stops the bot\'s ' +
  'answers and commands; the AI Auto-reply setting does not affect the bot. Not covered: the ' +
  'receipt confirmation.';

export const SourceDepartmentEditor = ({
  sourceId,
  onClose,
  onSaved,
  autoReply = 'mailbox',
}: Props) => {
  const { off: aiDraftsOff } = useAiDraftsOff();
  const [allDepts, setAllDepts] = useState<Department[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [defaultId, setDefaultId] = useState<number | undefined>();
  const [links, setLinks] = useState<SourceDepartmentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingLinkId, setTogglingLinkId] = useState<number | null>(null);
  const [teamsMode, setTeamsMode] = useState<boolean | undefined | null>(null);
  // Teams off: no team picker, only the channel's auto-reply switch (one team, one link).
  const teamsEnabled = deriveTeamsEnabled(teamsMode, allDepts);

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
      let mode: boolean | undefined;
      try {
        const [depts, assignments] = await Promise.all([
          departmentService.getAll(false, (value) => {
            mode = value;
          }),
          integrationsService.getSourceDepartments(sourceId),
        ]);
        if (ignore) return;
        setTeamsMode(mode);
        setAllDepts(depts);
        if (assignments.success && assignments.data) {
          setLinks(assignments.data);
          setSelected(assignments.data.map((assignment) => assignment.departmentId));
          const def = assignments.data.find((assignment) => assignment.isDefault);
          setDefaultId(def?.departmentId);
        }
      } catch (err) {
        logger.error('Failed to load teams:', err);
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    void load();
    return () => {
      ignore = true;
    };
  }, [sourceId]);

  const visibleLinks = links.filter((link) => selected.includes(link.departmentId));

  const handleSave = async () => {
    setSaving(true);
    try {
      await integrationsService.setSourceDepartments(sourceId, selected, defaultId);
      onSaved();
    } catch (err) {
      logger.error('Failed to save teams:', err);
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
          {teamsEnabled ? (
            <>
              <Building2 className="w-3.5 h-3.5" /> Assign teams
            </>
          ) : (
            <>
              <MessageCircleReply className="w-3.5 h-3.5" /> Automatic replies
            </>
          )}
        </span>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" className="p-0 w-auto h-auto text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </Button>
      </div>

      {(teamsEnabled || loading) && (
        <DepartmentMultiPicker
          allDepts={allDepts}
          selected={selected}
          defaultId={defaultId}
          loading={loading}
          onSelectedChange={setSelected}
          onDefaultChange={setDefaultId}
        />
      )}

      {!loading && autoReply !== 'none' && visibleLinks.length > 0 && (
        <div className={teamsEnabled ? 'mt-4 pt-3 border-t border-border/60' : 'mt-1'}>
          <p className="text-xs text-muted-foreground mb-2">
            {teamsEnabled ? 'Automatic replies per team:' : 'Automatic replies on this channel:'}
          </p>
          <p className="text-xs text-muted-foreground mb-2">{SWITCH_HELP}</p>
          {autoReply === 'telegram' && teamsEnabled && visibleLinks.length > 1 && (
            <p className="text-xs text-muted-foreground mb-2">
              Bot commands stop only when every team is off.
            </p>
          )}
          {aiDraftsOff && (
            <p className="text-xs text-warning mb-2">
              AI drafts are switched off for this workspace, so the AI sends no auto-reply — whatever
              is set here. Keyword rules with a plain prepared reply still send; rules that add a
              knowledge base answer do not. These apply again when AI drafts are switched back on.
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            {visibleLinks.map((link) => {
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleToggleAutoReply(link)}
                    disabled={isToggling}
                    className="gap-1 items-center p-0 h-auto text-xs hover:text-primary hover:bg-transparent"
                    title={
                      link.autoReplyEnabled
                        ? 'Automatic replies on — click to switch off'
                        : 'Automatic replies off — click to switch on'
                    }
                  >
                    {isToggling ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : link.autoReplyEnabled ? (
                      <>
                        <MessageCircleReply className="w-3.5 h-3.5 text-success" />
                        <span className="text-success">Automatic replies on</span>
                      </>
                    ) : (
                      <>
                        <MessageCircleOff className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">Automatic replies off</span>
                      </>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && (
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {teamsEnabled ? 'Cancel' : 'Close'}
          </Button>
          {teamsEnabled && (
            <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
              {saving && <Loader2 className="mr-1 w-3 h-3 animate-spin" />}
              Save
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
