import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Toggle } from '@/components/ui/Toggle';
import { getErrorBody } from '@/lib/errorMessages';
import { skillPatternPresetsService } from '@/services/skillPatternPresets.service';
import type {
  PlatformSkillPatternCatalogue,
  PlatformSkillPatternPreset,
} from '@/types/skillRouting';

/** A row as edited: `rowKey` keeps React's identity while the id is typed; `saved` locks the id. */
type Row = PlatformSkillPatternPreset & { rowKey: number; saved: boolean };

const NOT_DEPLOYED =
  'This server does not have the pattern catalogue yet — it arrives with the next backend release.';

let nextRowKey = 0;
const rowsOf = (catalogue: PlatformSkillPatternCatalogue): Row[] =>
  catalogue.presets.map((preset) => ({ ...preset, rowKey: nextRowKey++, saved: true }));
const blankRow = (): Row => ({
  id: '',
  label: '',
  example: '',
  category: '',
  regex: '',
  caseSensitive: false,
  enabled: true,
  rowKey: nextRowKey++,
  saved: false,
});
const presetOf = ({
  rowKey: _rowKey,
  saved: _saved,
  ...preset
}: Row): PlatformSkillPatternPreset => ({
  ...preset,
  id: preset.id.trim(),
  label: preset.label.trim(),
  example: preset.example?.trim() ?? '',
  category: preset.category.trim(),
});
const keyOf = (rows: Row[]): string => JSON.stringify(rows.map(presetOf));

const reasonOf = (error: unknown): string | undefined => {
  const body = getErrorBody(error) as { message?: unknown; error?: unknown } | undefined;
  return [body?.message, body?.error].find(
    (text): text is string => typeof text === 'string' && text.length > 0
  );
};

/**
 * The catalogue of ready-made skill routing patterns (global admin). Workspaces store a preset's
 * id, so an id cannot change once saved — disable the row instead (its workspaces keep the
 * pattern, it just does not match until it is enabled again). The backend checks every regex and
 * refuses a bad list with its reason, shown here.
 */
export const SkillPatternCatalogue = () => {
  const [loaded, setLoaded] = useState<PlatformSkillPatternCatalogue | null | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [savedKey, setSavedKey] = useState('[]');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const adopt = (catalogue: PlatformSkillPatternCatalogue) => {
    const next = rowsOf(catalogue);
    setLoaded(catalogue);
    setRows(next);
    setSavedKey(keyOf(next));
  };

  useEffect(() => {
    let live = true;
    skillPatternPresetsService
      .get()
      .then((catalogue) => {
        if (!live) return;
        if (catalogue) adopt(catalogue);
        else setLoaded(null);
      })
      .catch(() => {
        if (live) setLoadFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const heading = <p className="text-sm font-medium">Ready-made patterns</p>;
  if (loadFailed) {
    return (
      <div className="space-y-2">
        {heading}
        <p className="text-sm text-muted-foreground">Could not load the pattern catalogue.</p>
      </div>
    );
  }
  if (loaded === undefined) return null;
  if (loaded === null) {
    return (
      <div className="space-y-2">
        {heading}
        <p className="text-sm text-muted-foreground">{NOT_DEPLOYED}</p>
      </div>
    );
  }

  const dirty = keyOf(rows) !== savedKey;
  const edit = (rowKey: number, change: Partial<PlatformSkillPatternPreset>) => {
    setNotice(null);
    setRows((current) =>
      current.map((row) => (row.rowKey === rowKey ? { ...row, ...change } : row))
    );
  };

  const save = async () => {
    setBusy(true);
    try {
      const saved = await skillPatternPresetsService.save(rows.map(presetOf));
      if (saved) adopt(saved);
      else {
        // An answer without the list: keep what was sent, now saved.
        const next = rows.map((row) => ({ ...row, saved: true }));
        setRows(next);
        setSavedKey(keyOf(next));
        setLoaded({ presets: next.map(presetOf), isDefault: false });
      }
      setNotice('Catalogue saved.');
    } catch (error) {
      setNotice(reasonOf(error) ?? 'Could not save the catalogue. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {heading}
        {loaded.isDefault && !dirty && <Badge variant="secondary">Built-in defaults</Badge>}
      </div>
      <p className="text-xs text-muted-foreground">
        Workspace admins tick these on a skill value. The id is what workspaces store — it cannot
        change once saved. A disabled pattern is hidden from the list and does not match, but stays
        on the values that use it.
      </p>
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">No ready-made patterns.</p>
      )}
      <ul className="space-y-3">
        {rows.map((row, index) => {
          const name = row.id.trim() || `new pattern ${index + 1}`;
          return (
            <li key={row.rowKey} className="space-y-2 rounded-md border border-border p-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <Input
                  label="Id"
                  aria-label={`Id of ${name}`}
                  className="font-mono"
                  value={row.id}
                  readOnly={row.saved}
                  maxLength={40}
                  placeholder="e.g. order_number"
                  disabled={busy}
                  onChange={(event) => edit(row.rowKey, { id: event.target.value })}
                />
                <Input
                  label="Label"
                  aria-label={`Label of ${name}`}
                  value={row.label}
                  maxLength={80}
                  disabled={busy}
                  onChange={(event) => edit(row.rowKey, { label: event.target.value })}
                />
                <Input
                  label="Category"
                  aria-label={`Category of ${name}`}
                  value={row.category}
                  maxLength={40}
                  placeholder="e.g. shipping"
                  disabled={busy}
                  onChange={(event) => edit(row.rowKey, { category: event.target.value })}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  label="Regular expression"
                  aria-label={`Regular expression of ${name}`}
                  className="font-mono"
                  value={row.regex}
                  maxLength={200}
                  disabled={busy}
                  onChange={(event) => edit(row.rowKey, { regex: event.target.value })}
                />
                <Input
                  label="Example (optional)"
                  aria-label={`Example of ${name}`}
                  value={row.example ?? ''}
                  maxLength={80}
                  disabled={busy}
                  onChange={(event) => edit(row.rowKey, { example: event.target.value })}
                />
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <Checkbox
                  label="Case-sensitive"
                  aria-label={`Case-sensitive ${name}`}
                  checked={row.caseSensitive}
                  disabled={busy}
                  onChange={(event) => edit(row.rowKey, { caseSensitive: event.target.checked })}
                />
                <Toggle
                  label="Enabled"
                  ariaLabel={`Enabled ${name}`}
                  checked={row.enabled}
                  disabled={busy}
                  onChange={(next) => edit(row.rowKey, { enabled: next })}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Delete ${name}`}
                  className="text-destructive hover:text-destructive"
                  disabled={busy}
                  onClick={() => {
                    setNotice(null);
                    setRows((current) => current.filter((other) => other.rowKey !== row.rowKey));
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setNotice(null);
            setRows((current) => [...current, blankRow()]);
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add pattern
        </Button>
        <Button size="sm" isLoading={busy} disabled={busy || !dirty} onClick={() => void save()}>
          Save catalogue
        </Button>
        {notice ? (
          <span className="text-xs text-muted-foreground">{notice}</span>
        ) : (
          dirty && <span className="text-xs text-warning">Unsaved changes</span>
        )}
      </div>
    </div>
  );
};
