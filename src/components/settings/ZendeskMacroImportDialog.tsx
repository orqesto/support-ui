import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { getApiErrorMessage, getErrorStatus } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { parseZendeskMacros, type ZendeskMacro } from '@/lib/zendeskMacros';
import { MAX_TEMPLATE_NAME, replyTemplatesService } from '@/services/replyTemplates.service';

/**
 * Settings › Reply templates › Import from Zendesk: upload a macros export, see what each macro
 * becomes, then create one workspace template per macro through the ordinary create call — so the
 * same permission, limits and duplicate-name check apply as to a template made by hand.
 */

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names of the templates already listed; a macro with one of them is skipped. */
  existingNames: string[];
  /** Called after an import that created at least one template. */
  onImported: () => void;
};

type Skip = 'no_text' | 'name_taken' | 'name_too_long' | 'inactive';
type Outcome = { kind: 'created' } | { kind: 'exists' } | { kind: 'failed'; message: string };

const SKIP_LABELS: Record<Skip, string> = {
  no_text: 'No reply text',
  name_taken: 'Name already used',
  name_too_long: `Name over ${MAX_TEMPLATE_NAME} characters`,
  inactive: 'Inactive',
};

/** Why a macro is not imported, or null when it will be. Earlier macros claim a name first. */
const skipsOf = (
  macros: ZendeskMacro[],
  existingNames: string[],
  includeInactive: boolean
): Array<Skip | null> => {
  const taken = new Set(existingNames.map((name) => name.toLowerCase()));
  return macros.map((macro) => {
    if (!macro.body.trim()) return 'no_text';
    if (!macro.active && !includeInactive) return 'inactive';
    if (macro.title.length > MAX_TEMPLATE_NAME) return 'name_too_long';
    const key = macro.title.toLowerCase();
    if (taken.has(key)) return 'name_taken';
    taken.add(key);
    return null;
  });
};

export const ZendeskMacroImportDialog = ({
  open,
  onOpenChange,
  existingNames,
  onImported,
}: Props) => {
  const [macros, setMacros] = useState<ZendeskMacro[] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [importing, setImporting] = useState(false);
  const [outcomes, setOutcomes] = useState<Map<number, Outcome>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const skips = macros ? skipsOf(macros, existingNames, includeInactive) : [];
  const toImport = skips.flatMap((skip, index) => (skip === null ? [index] : []));
  const finished = outcomes.size > 0 && !importing;
  const count = (kind: Outcome['kind']) =>
    [...outcomes.values()].filter((outcome) => outcome.kind === kind).length;

  const reset = () => {
    setMacros(null);
    setFileError(null);
    setIncludeInactive(false);
    setOutcomes(new Map());
  };

  const readFile = async (file: File) => {
    reset();
    try {
      const parsed = parseZendeskMacros(await file.text());
      if (parsed.length === 0) throw new Error('This export holds no macros.');
      setMacros(parsed);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'The file could not be read.');
    }
  };

  const runImport = async () => {
    if (!macros) return;
    setImporting(true);
    const done = new Map<number, Outcome>();
    for (const index of toImport) {
      const macro = macros[index];
      try {
        await replyTemplatesService.create({
          name: macro.title,
          body: macro.body,
          use: 'both',
          departmentId: null,
        });
        done.set(index, { kind: 'created' });
      } catch (err) {
        // A template in a department this person cannot see can still hold the name.
        if (getErrorStatus(err) === 409) done.set(index, { kind: 'exists' });
        else {
          logger.error('Failed to import a Zendesk macro', err);
          done.set(index, {
            kind: 'failed',
            message: getApiErrorMessage(err) ?? 'Could not be saved.',
          });
        }
      }
      setOutcomes(new Map(done));
    }
    setImporting(false);
    if ([...done.values()].some((outcome) => outcome.kind === 'created')) onImported();
  };

  const statusOf = (index: number) => {
    const outcome = outcomes.get(index);
    if (outcome?.kind === 'created') return <Badge variant="success">Imported</Badge>;
    if (outcome?.kind === 'exists') return <Badge variant="secondary">Name already used</Badge>;
    if (outcome?.kind === 'failed') return <Badge variant="danger">{outcome.message}</Badge>;
    const skip = skips[index];
    return skip ? (
      <Badge variant="secondary">{SKIP_LABELS[skip]}</Badge>
    ) : (
      <Badge variant="default">{finished ? 'Not imported' : 'Ready'}</Badge>
    );
  };

  const inactiveCount = macros?.filter((macro) => !macro.active).length ?? 0;

  return (
    <Dialog
      open={open}
      size="lg"
      onOpenChange={(next) => {
        if (importing) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import macros from Zendesk</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Upload the JSON Zendesk returns for <code>/api/v2/macros.json</code>. Each macro’s reply
            text becomes a workspace template for both reply boxes; Zendesk fields such as{' '}
            <code>{'{{ticket.requester.first_name}}'}</code> become ours (
            <code>{'{first_name}'}</code>). Other macro actions (status, assignee, tags…) are not
            imported.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Zendesk macros file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
              event.target.value = '';
            }}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            <Upload className="w-4 h-4 mr-1" aria-hidden />
            {macros ? 'Choose another file' : 'Choose file'}
          </Button>
          {fileError && <Alert variant="danger">{fileError}</Alert>}
          {macros && (
            <>
              {inactiveCount > 0 && (
                <Checkbox
                  label={`Also import inactive macros (${inactiveCount})`}
                  checked={includeInactive}
                  onChange={(event) => setIncludeInactive(event.target.checked)}
                  disabled={importing || finished}
                />
              )}
              {finished && (
                <Alert variant={count('failed') > 0 ? 'warning' : 'success'}>
                  Imported {count('created')}. Name already used: {count('exists')}. Failed:{' '}
                  {count('failed')}.
                </Alert>
              )}
              <ul className="space-y-1 max-h-96 overflow-y-auto" aria-label="Macros in the file">
                {macros.map((macro, index) => (
                  <li
                    // The list is fixed per file and a title can repeat in it.
                    // eslint-disable-next-line react/no-array-index-key
                    key={`${index}-${macro.title}`}
                    className="p-2 rounded-md border border-border space-y-1"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium flex-1 min-w-0 truncate">
                        {macro.title}
                      </span>
                      {statusOf(index)}
                    </div>
                    {macro.description && (
                      <p className="text-xs text-muted-foreground">{macro.description}</p>
                    )}
                    {macro.unmappedFields.length > 0 && (
                      <p className="text-xs text-warning">
                        Left as written (no matching field): {macro.unmappedFields.join(', ')}
                      </p>
                    )}
                    {macro.ignoredActions.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Not imported: {macro.ignoredActions.join(', ')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
            disabled={importing}
          >
            {finished ? 'Close' : 'Cancel'}
          </Button>
          {macros && !finished && (
            <Button
              onClick={() => void runImport()}
              isLoading={importing}
              disabled={importing || toImport.length === 0}
            >
              {importing
                ? `Importing ${outcomes.size + 1} of ${toImport.length}…`
                : `Import ${toImport.length} ${toImport.length === 1 ? 'template' : 'templates'}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
