import { Input } from '@/components/ui/Input';

/**
 * ⛔ A FAILED TEST IS NOT AN EMPTY TREE. Each outcome says something different, and collapsing
 * them into "nothing came back" makes an admin retune a working integration.
 */
export const explainOutcome = (
  status: string,
  reason?: string,
  missingKind?: 'records' | 'fields',
  missing?: string[]
): string => {
  if (status === 'no_match')
    return 'Your system answered, but had nothing for that value. Try one you know exists.';
  if (status === 'shape_changed') {
    /**
     * ⛔ TWO DIFFERENT PROBLEMS behind one status, and they need opposite actions. `records`
     * means we could not find the record list at all — the fix is to say where it is, in the
     * box right there. Telling that admin "the fields changed" sends them to re-pick fields
     * they have not chosen yet, which is what this said to a brand-new lookup before.
     * ⚠️ An older backend sends no `missingKind`: unspecified, so keep the original wording
     * rather than asserting either.
     */
    if (missingKind === 'records') {
      const where = missing?.[0];
      return where
        ? `Your system answered, but we could not find the records under “${where}”. Tell us where they are below.`
        : 'Your system answered, but we could not find the records in it. Tell us where they are below.';
    }
    return 'Your system answered, but not with the fields this lookup expects any more.';
  }
  return reason ?? 'Your system did not answer.';
};

interface RecordsPathFieldProps {
  value: string;
  /** C1: the path a Test suggested and the wizard filled in, or null. */
  suggested: string | null;
  onChange: (next: string) => void;
}

/**
 * WHERE THE RECORDS LIVE in the vendor's answer, with the note that says when the box was filled
 * in from a Test's suggestion (C1) — so an admin sees why it changed, and can change it back.
 */
export function RecordsPathField({ value, suggested, onChange }: RecordsPathFieldProps) {
  return (
    <>
      <Input
        label="Where are the records in the answer? (optional)"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="data"
      />
      {suggested && (
        <p className="text-xs text-muted-foreground -mt-2">
          {suggested === '.' ? (
            <>
              Your system answers with a single record, so we read the whole answer (<code>.</code>
              ). Change this if your records are somewhere else.
            </>
          ) : (
            <>
              Your system’s answer suggested <code>{suggested}</code> here. Change this if your
              records are somewhere else.
            </>
          )}
        </p>
      )}
      <p className="text-xs text-muted-foreground -mt-2">
        Leave this blank and we work it out. Fill it in only if your system wraps the records under
        a name we did not guess — <code>results</code>, or <code>payload.items</code>. Use{' '}
        <code>.</code> if the answer IS the record, with nothing wrapped around it.
      </p>
    </>
  );
}
