/**
 * The merge dialog and Reply all, rendered (owner, 2026-09-23).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type * as MergeServiceModule from '@/services/conversationMerge.service';

const merge = vi.fn();
const listMerges = vi.fn();
const participants = vi.fn();
vi.mock('@/services/conversationMerge.service', async () => {
  const real = await vi.importActual<typeof MergeServiceModule>(
    '@/services/conversationMerge.service'
  );
  return {
    ...real,
    conversationMergeService: { ...real.conversationMergeService, merge, listMerges, participants },
  };
});
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'ODL' }));
const getById = vi.fn();
vi.mock('@/services/message.service', () => ({
  messageService: { getById: (...args: unknown[]): unknown => getById(...args) },
}));

const { MergeAssigneeConflictError } = await import('@/services/conversationMerge.service');
const { MergeConfirmDialog } = await import('../MergeConfirmDialog');
const { RecipientFields } = await import('../RecipientFields');
const { BulkActionBar } = await import('../bulk/BulkActionBar');
const { useThreadMergeContext } = await import('../useThreadMergeContext');
const { BulkMergeDialog } = await import('../bulk/BulkMergeDialog');

const SUP19 = {
  id: 29312,
  publicId: 'SUP-19',
  subject: 'odly.ai + BADideas',
  createdAt: '2026-08-31T07:18:23Z',
  sender: 'mp@deals.badideas.fund',
  assigneeId: 7,
  assigneeName: 'Dmytro',
};
const MKT1 = {
  id: 30384,
  publicId: 'MKT-1',
  subject: 'Re: odly.ai + BADideas',
  createdAt: '2026-09-23T12:54:03Z',
  sender: 'mp@badideas.fund',
  assigneeId: 9,
  assigneeName: 'Anna',
};

beforeEach(() => merge.mockReset());

describe('MergeConfirmDialog', () => {
  it('says what will happen, then merges the newer ticket INTO the older one', async () => {
    merge.mockResolvedValue(undefined);
    const onMerged = vi.fn();
    render(
      <MergeConfirmDialog open rows={[MKT1, SUP19]} onOpenChange={vi.fn()} onMerged={onMerged} />
    );

    expect(
      screen.getByText(/The messages of ODL-MKT-1 move into ODL-SUP-19, and it leaves the inbox/)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));

    await waitFor(() => expect(onMerged).toHaveBeenCalledWith(SUP19));
    expect(merge).toHaveBeenCalledWith(29312, [30384], undefined);
  });

  it('asks who keeps the ticket when both are being worked, and sends that choice', async () => {
    merge
      .mockRejectedValueOnce(new MergeAssigneeConflictError([7, 9]))
      .mockResolvedValue(undefined);
    render(
      <MergeConfirmDialog open rows={[SUP19, MKT1]} onOpenChange={vi.fn()} onMerged={vi.fn()} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Anna' }));

    await waitFor(() => expect(merge).toHaveBeenLastCalledWith(29312, [30384], 9));
  });

  it('offers no Merge while a notice stands in for the choice', () => {
    render(
      <MergeConfirmDialog
        open
        rows={[SUP19, MKT1]}
        onOpenChange={vi.fn()}
        onMerged={vi.fn()}
        notice="nope"
      />
    );
    expect(screen.getByRole('button', { name: 'Merge' })).toBeDisabled();
  });
});

describe('RecipientFields — Reply all', () => {
  const people = ['mp@badideas.fund', 'deals@badideas.fund', 'mp@deals.badideas.fund'];

  it('offers Reply all with the number it adds, and fills Cc with the others', () => {
    const onChange = vi.fn();
    render(
      <RecipientFields
        draft={{ to: '', cc: '', bcc: '' }}
        onChange={onChange}
        defaultTo="mp@badideas.fund"
        participants={people}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reply all (+2)' }));
    expect(onChange).toHaveBeenCalledWith({
      to: '',
      cc: 'deals@badideas.fund, mp@deals.badideas.fund',
      bcc: '',
    });
  });

  it('offers nothing when the thread has only the one correspondent', () => {
    render(
      <RecipientFields
        draft={{ to: '', cc: '', bcc: '' }}
        onChange={vi.fn()}
        defaultTo="mp@badideas.fund"
        participants={['mp@badideas.fund']}
      />
    );
    expect(screen.queryByRole('button', { name: /Reply all/ })).not.toBeInTheDocument();
  });
});

describe('BulkActionBar — Merge', () => {
  const bar = (selectedCount: number) =>
    render(
      <BulkActionBar
        selectedCount={selectedCount}
        previews={{}}
        loading={false}
        onPick={vi.fn()}
        onClear={vi.fn()}
        onMerge={vi.fn()}
        mergeMax={21}
      />
    );

  it('is offered for two or more tickets', () => {
    bar(2);
    expect(screen.getByRole('button', { name: 'Merge' })).toBeInTheDocument();
  });

  it('is not offered for one ticket, or for more than one merge accepts', () => {
    bar(1);
    expect(screen.queryByRole('button', { name: 'Merge' })).not.toBeInTheDocument();
    bar(22);
    expect(screen.queryByRole('button', { name: 'Merge' })).not.toBeInTheDocument();
  });
});

describe('timeline label for a merged-in message', () => {
  const event = (trail: number[]) =>
    ({
      id: 1,
      conversationId: 1,
      type: 'inbound',
      content: '',
      channel: 'email',
      createdAt: '',
      metadata: { mergeTrail: trail },
    }) as never;

  it('names the ticket it came from, in the format agents see everywhere', async () => {
    listMerges.mockResolvedValue([
      { id: 30384, publicId: 'MKT-1', subject: null, mergedAt: null, mergedBy: null },
    ]);
    participants.mockResolvedValue([]);
    const { result } = renderHook(() => useThreadMergeContext(29312, true, 0));
    await waitFor(() =>
      expect(result.current.mergedFromLabel(event([30384]))).toBe('from ODL-MKT-1')
    );
  });

  it('never shows an internal row id for a ticket it cannot name', async () => {
    listMerges.mockResolvedValue([]);
    participants.mockResolvedValue([]);
    const { result } = renderHook(() => useThreadMergeContext(29312, true, 0));
    await waitFor(() => expect(listMerges).toHaveBeenCalled());
    expect(result.current.mergedFromLabel(event([555]))).toBe('from a merged ticket');
    expect(result.current.mergedFromLabel(event([]))).toBeNull();
  });
});

describe('BulkMergeDialog', () => {
  const open = () =>
    render(
      <BulkMergeDialog
        open
        selectedIds={[29312, 30384]}
        onOpenChange={vi.fn()}
        onMerged={vi.fn()}
      />
    );

  it('says merging is unavailable — and offers no Merge — on a backend without the route', async () => {
    listMerges.mockResolvedValue(null);
    getById.mockImplementation((id: number) =>
      Promise.resolve({ data: id === 29312 ? SUP19 : MKT1 })
    );
    open();
    expect(
      await screen.findByText(/Merging is not available on this server yet/)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Merge' })).toBeDisabled();
  });

  it('refuses to merge a selection it could not read in full', async () => {
    listMerges.mockResolvedValue([]);
    getById.mockImplementation((id: number) =>
      id === 29312 ? Promise.resolve({ data: SUP19 }) : Promise.reject(new Error('boom'))
    );
    open();
    expect(await screen.findByText(/could not be read just now/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Merge' })).toBeDisabled();
  });

  it('offers the merge when every ticket was read and the server can merge', async () => {
    listMerges.mockResolvedValue([]);
    getById.mockImplementation((id: number) =>
      Promise.resolve({ data: { ...(id === 29312 ? SUP19 : MKT1), channel: 'email' } })
    );
    open();
    expect(await screen.findByText(/move into ODL-SUP-19/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Merge' })).toBeEnabled();
  });
});
