/**
 * Decision 6: while my reply draft is non-blank and the thread is assigned to someone else, one
 * line above the composer — "Assigned to Anna". Informational only; it blocks nothing.
 */
import { isBlankRichText } from '@/lib/stripHtml';
import { useOrgMemberNames } from './useOrgMemberNames';

export const showAssignedNote = ({
  assigneeId,
  myId,
  composer,
  mode,
}: {
  assigneeId: number | null | undefined;
  myId: number | null | undefined;
  composer: string;
  mode: 'reply' | 'note';
}): boolean =>
  mode === 'reply' &&
  assigneeId !== null &&
  assigneeId !== undefined &&
  assigneeId !== myId &&
  !isBlankRichText(composer);

/** Render only when `showAssignedNote` holds: the member list loads only then. */
export function AssignedNote({
  assigneeId,
  fallbackName,
}: {
  assigneeId: number;
  /** The list endpoint's `assigneeName`, when the member list does not know the person. */
  fallbackName?: string | null;
}) {
  const agent = useOrgMemberNames()(assigneeId);
  const name = agent.known ? agent.name : (fallbackName ?? agent.name);
  return (
    <p data-testid="assigned-note" className="m-0 mb-1.5 text-[11.5px] text-muted-foreground">
      Assigned to {name}
    </p>
  );
}
