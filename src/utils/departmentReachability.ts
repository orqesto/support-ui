import type { Department } from '@/types';

/**
 * Source-reachability helpers over the derived `hasMessageSource` / `kbOnly` fields the BE
 * returns on `GET /api/departments`. "Served" means a live message channel routes to the
 * department, so it can actually receive tickets — orthogonal to `active` (admin on/off).
 *
 * `hasMessageSource === undefined` (e.g. a cached payload that predates the field) is
 * treated as SERVED, so a stale response never wrongly blocks a selection.
 */
type ReachabilityFields = Pick<Department, 'hasMessageSource' | 'kbOnly'>;

export const isDepartmentServed = (dept: ReachabilityFields): boolean =>
  dept.hasMessageSource !== false;

/**
 * Short suffix explaining why an unserved department is disabled in an assignment list;
 * `null` when the department is served (no mark). Used verbatim in the user-provisioning
 * pickers — e.g. `Sales — no message source`.
 */
export const departmentUnservedLabel = (dept: ReachabilityFields): string | null => {
  if (isDepartmentServed(dept)) return null;
  return dept.kbOnly ? 'knowledge base only' : 'no message source';
};
