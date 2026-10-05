import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { useDepartmentById } from '@/hooks/useDepartments';
import type { KbFindingBannerProps } from '@/hooks/useKbFindingFilter';
import { KB_FINDING_TEXT } from '@/lib/kbFinding';

type Props = KbFindingBannerProps & {
  /** Null while the list is loading. */
  total: number | null;
};

/**
 * Says the list is narrowed to one KB cases finding's entries — only when the server says it is —
 * and how to leave it. The count is the finding's own only when no other filter narrows it.
 */
/** Renders nothing — and asks for nothing (no department lookup) — without a finding. */
export const KbFindingBanner = (props: Props) =>
  props.filter ? <FindingBanner {...props} filter={props.filter} /> : null;

const FindingBanner = ({
  filter,
  result,
  otherFilters,
  onShowAll,
  total,
}: Props & { filter: NonNullable<Props['filter']> }) => {
  // The finding is per department, and the global department selector does not narrow it.
  const department = useDepartmentById(filter.departmentId);
  const text = KB_FINDING_TEXT[filter.finding];
  const where = department ? ` in ${department.name}` : '';
  const showAll = (
    <Button variant="outline" size="sm" onClick={() => onShowAll()}>
      Show all entries
    </Button>
  );
  if (result === 'unsupported') {
    return (
      <Alert variant="warning">
        <div className="flex flex-wrap gap-3 justify-between items-start">
          <AlertDescription>
            This server cannot open a finding&apos;s own list yet, so the list below is every entry,
            not only the {text.title.toLowerCase()}.
          </AlertDescription>
          {showAll}
        </div>
      </Alert>
    );
  }
  const count =
    result !== 'applied' || total === null
      ? ''
      : otherFilters
        ? ` (${total.toLocaleString()} shown — other filters are on)`
        : ` (${total.toLocaleString()})`;
  return (
    <Alert variant="info">
      <div className="flex flex-wrap gap-3 justify-between items-start">
        <div>
          <AlertTitle>
            {text.title}
            {where}
            {count}
          </AlertTitle>
          <AlertDescription>
            {result === 'failed' ? 'The list could not be loaded.' : text.description}
          </AlertDescription>
        </div>
        {showAll}
      </div>
    </Alert>
  );
};
