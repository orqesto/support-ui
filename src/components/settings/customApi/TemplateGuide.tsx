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
  onDone: () => void;
  onCancel: () => void;
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

  const advance = (ids: Record<string, number>) => {
    createdId.current = null;
    setPicked([]);
    if (step + 1 >= lookups.length) onDone();
    else setStep(step + 1);
    setSavedIds(ids);
  };

  /**
   * Ids including the step just saved, held until the reload succeeds. ⛔ A failed reload stays
   * on the step and offers Try again: advancing with the old connection would hide the saved
   * lookup from the next step's ownership choice, and Skip would drop its id.
   */
  const pendingIds = useRef<Record<string, number> | null>(null);
  const [reloadFailed, setReloadFailed] = useState(false);

  const reload = () => {
    const ids = pendingIds.current ?? savedIds;
    setReloadFailed(false);
    customApiService
      .list()
      .then((all) => {
        const fresh = all.find((one) => one.id === connection.id);
        if (fresh) setConnection(fresh);
        saving.current = false;
        pendingIds.current = null;
        advance(ids);
      })
      .catch(() => {
        saving.current = false;
        setReloadFailed(true);
      });
  };

  const onSaved = () => {
    saving.current = true;
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
        <Button size="sm" variant="ghost" onClick={() => advance(savedIds)}>
          {feedsOwnership ? "My API can't list a customer's records — skip" : 'Skip this step'}
        </Button>
      </div>
      {lookup.description && <p className="text-sm">{lookup.description}</p>}
      {reloadFailed && (
        <Alert variant="warning">
          <AlertDescription>
            Saved, but the connection could not be reloaded.{' '}
            <Button size="sm" variant="outline" onClick={reload}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}
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
            if (!saving.current) onCancel();
          }}
          onPickedChange={setPicked}
        />
        <TemplateChecklist
          checklist={lookup.checklist}
          picked={picked}
          feedsOwnership={feedsOwnership}
        />
      </div>
    </div>
  );
};
