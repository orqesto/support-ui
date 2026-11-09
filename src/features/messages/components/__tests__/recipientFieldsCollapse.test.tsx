/**
 * Opening the recipient fields must not be a one-way door — and closing them must not hide a
 * live recipient.
 *
 * Those two requirements pull against each other, which is the whole reason this file exists.
 * The fields are revealed by local state while their VALUES live in the parent's draft, so
 * collapsing does not clear anything: without a summary that reports what is still set, an agent
 * who typed a Cc and then collapsed would send to someone they can no longer see. Bcc is worse —
 * nobody on the thread can reveal it for us afterwards.
 *
 * So: collapsing keeps the addresses and says so; removing an address is a separate, explicit act.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RecipientFields, type RecipientDraft } from '../RecipientFields';

const draft = (over: Partial<RecipientDraft> = {}): RecipientDraft => ({
  to: '',
  cc: '',
  bcc: '',
  ...over,
});

const renderFields = (initial: RecipientDraft) =>
  render(<RecipientFields draft={initial} onChange={vi.fn()} defaultTo="customer@example.com" />);

describe('recipient fields — opening and closing', () => {
  it('can be closed again after being opened', () => {
    // The reported bug: a mis-click wedged three fields open above the composer for the rest of
    // the reply, with nothing to dismiss them.
    renderFields(draft());

    fireEvent.click(screen.getByText('Edit recipients'));
    expect(screen.getByLabelText('To')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Collapse recipient fields'));
    expect(screen.queryByLabelText('To')).not.toBeInTheDocument();
    expect(screen.getByText('Edit recipients')).toBeInTheDocument();
  });

  it('reports a Cc that is still set after collapsing', () => {
    // Collapsing hides the field, not the recipient. The summary is the only thing standing
    // between that and a silently-addressed third party.
    renderFields(draft({ cc: 'a@x.com, b@x.com' }));

    expect(screen.getByText(/cc 2/)).toBeInTheDocument();
  });

  it('reports a Bcc that is still set after collapsing', () => {
    renderFields(draft({ bcc: 'hidden@x.com' }));

    expect(screen.getByText(/bcc 1/)).toBeInTheDocument();
  });

  it('says nothing about Cc or Bcc when neither holds an address', () => {
    // The common reply addresses the requester and needs no addressing decision at all; the
    // summary must not add noise to it.
    renderFields(draft({ to: 'someone@x.com' }));

    expect(screen.queryByText(/cc /)).not.toBeInTheDocument();
    expect(screen.queryByText(/bcc /)).not.toBeInTheDocument();
  });

  it('reopens with the populated fields already visible', () => {
    // Otherwise reopening shows an empty-looking form that is still addressing people — the
    // expanded view would contradict the summary line right above it.
    renderFields(draft({ cc: 'a@x.com' }));

    fireEvent.click(screen.getByText('Edit recipients'));

    expect(screen.getByLabelText('Cc')).toHaveValue('a@x.com');
  });

  it('empties the field when the address is explicitly removed', () => {
    // Removing is a deliberate act with a visible result, which is what collapsing deliberately
    // is not.
    const onChange = vi.fn();
    render(
      <RecipientFields
        draft={draft({ cc: 'a@x.com' })}
        onChange={onChange}
        defaultTo="customer@example.com"
      />
    );

    fireEvent.click(screen.getByText('Edit recipients'));
    fireEvent.click(screen.getByLabelText('Remove Cc'));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ cc: '' }));
  });
});
