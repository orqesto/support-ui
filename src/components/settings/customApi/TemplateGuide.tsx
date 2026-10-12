import { useRef, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import {
  customApiService,
  type CustomApiConnection,
  type FieldPick,
} from '@/services/customApi.service';
import type { CustomApiTemplate } from '@/services/customApiTemplates.service';
import { EndpointWizard } from './EndpointWizard';
import { TemplateChecklist } from './TemplateChecklist';
import { initialFromTemplate } from './templateInitial';
import { partialTemplateNotice, type KeptStep } from './templateNotice';

/**
 * Applies a template step by step: one existing lookup form per template lookup, pre-filled.
 * ⛔ Moves on only after a real Save — the form deletes a lookup created by Test if it unmounts
 * unsaved (useTestRevert), which is right for Skip and wrong for "next". After each save the
 * connection is re-read, so the next form's ownership choice lists the lookup just saved.
 */
export const TemplateGuide = ({
  connection: initialConnection,
  template,
  onDone,
  onCancel,
}: {
  connection: CustomApiConnection;
  template: CustomApiTemplate;
  /** F4: `notice` says what was kept and what was not, when the template was applied in part. */
  onDone: (notice?: string) => void;
  onCancel: (notice?: string) => void;
}) => {
  const lookups = template.definition.lookups;
  const [step, setStep] = useState(0);
  const [connection, setConnection] = useState(initialConnection);
  const [savedIds, setSavedIds] = useState<Record<string, number>>({});
  const [picked, setPicked] = useState<FieldPick[]>([]);
  const createdId = useRef<number | null>(null);
  const saving = useRef(false);
  const lookup = lookups[step];
  const feedsOwnership = lookups.some((other) => other.ownershipFrom === lookup.key);
  /** F4: steps kept so far, by step index — saved here, or an existing lookup reused. */
  const kept = useRef<Record<number, KeptStep>>({});
  /**
   * F4: this template already made a lookup for this step on this connection (same template, same
   * kind of look-up). ⛔ Offered, never silently duplicated: the form opens only on "Add another
   * one". A lookup this run already saved or reused is not offered twice.
   */
  const usedIds = Object.values(savedIds);
  const existing = connection.endpoints.find(
    (one) =>
      one.templateKey === template.key &&
      one.parameterSource === lookup.parameterSource &&
      !usedIds.includes(one.id)
  );
  const [addAnother, setAddAnother] = useState(false);
  const notice = () => partialTemplateNotice(lookups, kept.current);

  /**
   * Ids including the step just saved, held until the reload succeeds. ⛔ A failed reload stays
   * on the step and offers Try again: advancing with the old connection would hide the saved
   * lookup from the next step's ownership choice, and Skip would drop its id.
   */
  const pendingIds = useRef<Record<string, number> | null>(null);
  const [reloadFailed, setReloadFailed] = useState(false);
  /** A saved step whose reload is in flight or failed: Skip would drop its id, so it is hidden. */
  const [awaitingReload, setAwaitingReload] = useState(false);
  /**
   * ⛔ One reload at a time (a double "Try again" would advance twice — onDone twice on the last
   * step), and nothing after the guide has been cancelled or finished: a late result is ignored.
   */
  const reloadInFlight = useRef(false);
  const [retrying, setRetrying] = useState(false);
  const finished = useRef(false);

  const advance = (ids: Record<string, number>) => {
    pendingIds.current = null;
    setReloadFailed(false);
    setAwaitingReload(false);
    createdId.current = null;
    setPicked([]);
    setAddAnother(false);
    if (step + 1 >= lookups.length) {
      finished.current = true;
      onDone(notice());
    } else setStep(step + 1);
    setSavedIds(ids);
  };

  const reload = () => {
    if (reloadInFlight.current || finished.current) return;
    reloadInFlight.current = true;
    setRetrying(true);
    const ids = pendingIds.current ?? savedIds;
    // The alert (and so the hidden Skip) stays until a reload succeeds — advance() clears it.
    customApiService
      .list()
      .then((all) => {
        reloadInFlight.current = false;
        setRetrying(false);
        if (finished.current) return;
        const fresh = all.find((one) => one.id === connection.id);
        if (fresh) setConnection(fresh);
        // Every reload follows a Save of this step (onSaved, or Try again after one).
        const saved = fresh?.endpoints.find((one) => one.id === ids[lookup.key]);
        kept.current[step] = { label: saved?.label ?? lookup.label, existing: false };
        saving.current = false;
        advance(ids);
      })
      .catch(() => {
        reloadInFlight.current = false;
        setRetrying(false);
        if (finished.current) return;
        saving.current = false;
        setReloadFailed(true);
      });
  };

  const onSaved = () => {
    saving.current = true;
    setAwaitingReload(true);
    const id = createdId.current;
    pendingIds.current = id === null ? savedIds : { ...savedIds, [lookup.key]: id };
    reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {template.name} · step {step + 1} of {lookups.length}
        </p>
        {/* ⛔ No Skip while a saved step awaits its reload: it would drop the saved id. */}
        {!awaitingReload && (
          <Button size="sm" variant="ghost" onClick={() => advance(savedIds)}>
            {feedsOwnership ? "My API can't list a customer's records — skip" : 'Skip this step'}
          </Button>
        )}
      </div>
      {lookup.description && <p className="text-sm">{lookup.description}</p>}
      {existing && !addAnother && (
        <Alert variant="info">
          <AlertDescription>
            <span className="block">Already set up: “{existing.label}”.</span>
            <span className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => {
                  kept.current[step] = { label: existing.label, existing: true };
                  advance({ ...savedIds, [lookup.key]: existing.id });
                }}
              >
                Use the existing one
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAddAnother(true)}>
                Add another one
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      )}
      {reloadFailed && (
        <Alert variant="warning">
          <AlertDescription>
            Saved, but the connection could not be reloaded.{' '}
            <Button size="sm" variant="outline" disabled={retrying} onClick={reload}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {(!existing || addAnother) && (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <EndpointWizard
            key={`${template.key}-${lookup.key}`}
            connection={connection}
            initial={initialFromTemplate(template.key, lookup, savedIds)}
            onCreated={(id) => {
              createdId.current = id;
            }}
            onSaved={onSaved}
            onClose={() => {
              if (saving.current) return;
              finished.current = true;
              onCancel(notice());
            }}
            onPickedChange={setPicked}
          />
          <TemplateChecklist
            checklist={lookup.checklist}
            picked={picked}
            feedsOwnership={feedsOwnership}
          />
        </div>
      )}
    </div>
  );
};
