import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The merge service, through the REAL service (owner, 2026-09-23).
 *
 * Skew: this FE deploys on merge while the BE ships on a tag, so it meets backends with no merge
 * routes. Those reads must fail SOFT (`null` = "could not ask"), and only the ASSIGNEE 409 may
 * become a question — the other 409 ("merged or deleted meanwhile") is an error to show.
 */
const post = vi.fn();
const get = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    post: (...args: unknown[]): unknown => post(...args),
    get: (...args: unknown[]): unknown => get(...args),
  },
}));

const { conversationMergeService, MergeAssigneeConflictError } = await import(
  '../conversationMerge.service'
);

const httpError = (status: number, data: unknown) =>
  Object.assign(new Error('http'), { status, data });

beforeEach(() => {
  post.mockReset();
  get.mockReset();
});

describe('conversationMergeService', () => {
  it('posts the survivor in the path and the sources in the body', async () => {
    post.mockResolvedValue({ data: { success: true } });
    await conversationMergeService.merge(12, [34, 56]);
    expect(post).toHaveBeenCalledWith('/api/messages/12/merge', { sourceIds: [34, 56] });
  });

  it('turns the assignee 409 into a choice, with the people to choose between', async () => {
    post.mockRejectedValue(
      httpError(409, { error: 'assignee_conflict', data: { assigneeIds: [7, 9] } })
    );
    const failure = await conversationMergeService.merge(12, [34]).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(MergeAssigneeConflictError);
    expect((failure as InstanceType<typeof MergeAssigneeConflictError>).assigneeIds).toEqual([
      7, 9,
    ]);
  });

  it('leaves any OTHER 409 as the error it is', async () => {
    post.mockRejectedValue(httpError(409, { error: 'One of these conversations was just merged' }));
    const failure = await conversationMergeService.merge(12, [34]).catch((err: unknown) => err);
    expect(failure).not.toBeInstanceOf(MergeAssigneeConflictError);
  });

  it('says "could not ask" — not "nothing merged" — when an older backend has no route', async () => {
    get.mockRejectedValue(httpError(404, {}));
    expect(await conversationMergeService.listMerges(12)).toBeNull();
    expect(await conversationMergeService.participants(12)).toBeNull();
  });

  it('drops participant rows that are not addresses', async () => {
    get.mockResolvedValue({
      data: { data: { participants: [{ address: 'a@x.example' }, { address: 'nope' }, {}] } },
    });
    expect((await conversationMergeService.participants(12))?.map((row) => row.address)).toEqual([
      'a@x.example',
    ]);
  });
});
