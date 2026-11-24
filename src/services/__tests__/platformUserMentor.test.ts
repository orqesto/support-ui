/** Console user directory (1.1.330): `workspaces[].isMentor`, false when an older backend omits it. */
import { vi, describe, it, expect } from 'vitest';

const get = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({ apiClient: { get: (...args: unknown[]) => get(...args) } }));

import { platformService } from '@/services/platform.service';

const user = {
  id: 1,
  email: 'a@example.com',
  firstName: 'A',
  lastName: null,
  role: 'user',
  workspaces: [
    { organizationId: 2, organizationName: 'One', role: 'support', idpManaged: false, isMentor: true },
    { organizationId: 3, organizationName: 'Two', role: 'support', idpManaged: false },
  ],
};

describe('platformService — workspaces[].isMentor', () => {
  it('getUser keeps the mark and fills false where it is missing', async () => {
    get.mockResolvedValue({ data: { data: user } });
    const row = await platformService.getUser(1);
    expect(row.workspaces.map((workspace) => workspace.isMentor)).toEqual([true, false]);
  });

  it('listUsers does the same', async () => {
    get.mockResolvedValue({ data: { data: [user], pagination: {} } });
    const { rows } = await platformService.listUsers({ page: 1, pageSize: 25 });
    expect(rows[0].workspaces.map((workspace) => workspace.isMentor)).toEqual([true, false]);
  });
});
