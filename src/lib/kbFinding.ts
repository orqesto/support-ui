/**
 * A KB cases finding opens the knowledge base list narrowed to exactly the entries it counted
 * (`?finding=raw_email&departmentId=3#qa_pair`). The ids are the report's own, server-side, so the
 * list holds what the finding said — never "all entries" with a hint to look for them.
 */
import { KB_FINDINGS, type KbFinding } from '@/services/kb.service';

export type KbFindingFilter = { finding: KbFinding; departmentId: number };

/** Both parameters or nothing: a finding is per department. */
export const kbFindingFromSearch = (search: URLSearchParams): KbFindingFilter | null => {
  const finding = search.get('finding');
  const departmentId = Number(search.get('departmentId'));
  if (!KB_FINDINGS.includes(finding as KbFinding)) return null;
  if (!Number.isInteger(departmentId) || departmentId <= 0) return null;
  return { finding: finding as KbFinding, departmentId };
};

export const kbFindingHref = (finding: KbFinding, departmentId: number): string =>
  `/knowledge-base?finding=${finding}&departmentId=${departmentId}#qa_pair`;

/** The same search with the finding removed (the banner's "Show all entries"). */
export const withoutKbFinding = (search: URLSearchParams): string => {
  const next = new URLSearchParams(search);
  next.delete('finding');
  next.delete('departmentId');
  return next.toString();
};

export const KB_FINDING_TEXT: Record<KbFinding, { title: string; description: string }> = {
  raw_email: {
    title: 'Learned entries that are raw emails, not questions',
    description:
      'From the Knowledge base cases findings. Hide or reject the ones that should not answer customers.',
  },
  awaiting_review: {
    title: 'Entries awaiting a KB review',
    description:
      'From the Knowledge base cases findings: entries a person saved that a reviewer has not decided yet.',
  },
};
