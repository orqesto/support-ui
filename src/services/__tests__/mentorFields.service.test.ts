/**
 * Mentors (1.1.330): `isMentor` on assignable users and workspace members, and the per-member
 * mentor mark. The FE can reach production before the backend that sends the field: a missing
 * `isMentor` reads as a working agent (false) and the server's order is kept.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const get = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const patch = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args),
    patch: (...args: unknown[]) => patch(...args),
  },
}));
// No shared cache between cases.
vi.mock('@/lib/scopedLookup', () => ({
  scopedLookup: (_name: string, load: () => Promise<unknown>) => load(),
}));

import { assignmentService } from '@/services/assignment.service';
import { userService } from '@/services/user.service';
import { organizationService } from '@/services/organization.service';

const reply = (data: unknown) => ({ data: { success: true, data } });
const person = (id: number, extra: object = {}) => ({
  id,
  firstName: `P${id}`,
  lastName: null,
  email: `p${id}@example.com`,
  role: 'user',
  ...extra,
});

beforeEach(() => vi.clearAllMocks());

describe('assignable users carry isMentor', () => {
  it('passes the server’s mark and order through', async () => {
    get.mockResolvedValue(reply([person(1), person(2, { isMentor: false }), person(3, { isMentor: true })]));
    const rows = await assignmentService.getAssignableUsers();
    expect(rows.map((row) => [row.id, row.isMentor])).toEqual([
      [1, false],
      [2, false],
      [3, true],
    ]);
  });

  it('an older backend without the field: everyone is a working agent, order kept', async () => {
    get.mockResolvedValue(reply([person(5), person(4)]));
    const rows = await assignmentService.getAssignableUsers();
    expect(rows.map((row) => [row.id, row.isMentor])).toEqual([
      [5, false],
      [4, false],
    ]);
  });
});

describe('workspace member lists carry isMentor', () => {
  it('/api/users: the mark, false when missing', async () => {
    get.mockResolvedValue(
      reply({ users: [person(1, { isMentor: true }), person(2)], pagination: { totalPages: 1 } })
    );
    const { data, mentorSupported } = await userService.getAll();
    expect(data.map((user) => user.isMentor)).toEqual([true, false]);
    expect(mentorSupported).toBe(true);
  });

  it('/api/users from an older backend (no isMentor on any row): mentors not supported (F4)', async () => {
    get.mockResolvedValue(reply({ users: [person(1), person(2)], pagination: { totalPages: 1 } }));
    const { data, mentorSupported } = await userService.getAll();
    expect(data.map((user) => user.isMentor)).toEqual([false, false]);
    expect(mentorSupported).toBe(false);
  });

  it('control: a backend that sends isMentor:false on every row supports mentors', async () => {
    get.mockResolvedValue(
      reply({ users: [person(1, { isMentor: false })], pagination: { totalPages: 1 } })
    );
    await expect(userService.getAllPages()).resolves.toMatchObject({ mentorSupported: true });
  });

  it('/api/organizations/members: the mark, false when missing', async () => {
    get.mockResolvedValue(
      reply([
        { userId: 1, firstName: 'A', isMentor: true },
        { userId: 2, firstName: 'B' },
      ])
    );
    const members = await organizationService.getMembers();
    expect(members.map((member) => member.isMentor)).toEqual([true, false]);
  });
});

describe('the mentor mark', () => {
  it('PATCH sends { isMentor } and answers the mark and the open tickets still owned', async () => {
    patch.mockResolvedValue(reply({ isMentor: true, openAssigned: 3 }));
    await expect(userService.setMentor(7, true)).resolves.toEqual({ isMentor: true, openAssigned: 3 });
    expect(patch).toHaveBeenCalledWith('/api/users/7/mentor', { isMentor: true });
  });

  it('PATCH with a body missing openAssigned reads as none open', async () => {
    patch.mockResolvedValue(reply({ isMentor: false }));
    await expect(userService.setMentor(7, false)).resolves.toEqual({ isMentor: false, openAssigned: 0 });
  });
});
