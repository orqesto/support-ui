import { Input } from '@/components/ui/Input';
import { LIMIT_FIELDS, type LimitDraft, type LimitKey } from './limitFields';

/** One number field per plan limit, with what the limit governs as the hint. */
export const LimitInputsGrid = ({
  draft,
  onChange,
  blankMeans,
  idPrefix,
}: {
  draft: LimitDraft;
  onChange: (key: LimitKey, value: string) => void;
  /** What an empty field does, said under the grid: "keep" (plan update) or "unlimited" (new plan). */
  blankMeans: 'keep' | 'unlimited';
  idPrefix: string;
}) => (
  <div className="space-y-2">
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {LIMIT_FIELDS.map(({ key, label, hint }) => (
        <div key={key} className="space-y-1">
          <Input
            id={`${idPrefix}-${key}`}
            label={label}
            type="number"
            min={0}
            value={draft[key] ?? ''}
            onChange={(event) => onChange(key, event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      ))}
    </div>
    <p className="text-xs text-muted-foreground">
      {blankMeans === 'keep'
        ? 'A blank field keeps the value the plan has now. 999999 means unlimited.'
        : 'A blank field means unlimited. 999999 also means unlimited.'}
    </p>
  </div>
);
