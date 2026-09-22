/**
 * L2 P2 — the screen where an admin writes their own words for a vendor's statuses.
 *
 * ⛔ Two things it must never do: propose wording (the admin owns the words), and treat the
 * observed-but-unmapped list as editable (it is an observation about a vendor, not a setting).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatusVocabularyStep } from '../StatusVocabularyStep';

afterEach(cleanup);

describe('StatusVocabularyStep', () => {
  it('adds a mapping from the two inputs', async () => {
    const onChange = vi.fn();
    render(<StatusVocabularyStep labels={{}} seen={[]} onChange={onChange} />);

    await userEvent.type(screen.getByLabelText(/status value/i), 'in_transit');
    await userEvent.type(screen.getByLabelText(/what agents read$/i), 'On its way');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(onChange).toHaveBeenCalledWith({ in_transit: 'On its way' });
  });

  it('🔴 REMOVES a key rather than blanking it', async () => {
    // The map is sent whole; an empty string would be stored as a word that renders as nothing.
    const onChange = vi.fn();
    render(
      <StatusVocabularyStep
        labels={{ in_transit: 'On its way', shipped: 'Sent' }}
        seen={[]}
        onChange={onChange}
      />
    );

    await userEvent.click(screen.getByLabelText('Remove the wording for in_transit'));

    expect(onChange).toHaveBeenCalledWith({ shipped: 'Sent' });
  });

  it('offers what the lookup has SEEN and says where it came from', () => {
    render(<StatusVocabularyStep labels={{}} seen={['AWAITING_FULFILMENT']} onChange={vi.fn()} />);

    expect(screen.getByText(/Seen from this lookup/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'AWAITING_FULFILMENT' })).toBeTruthy();
  });

  it('🔴 does not offer a value that is already mapped', () => {
    // The backend stops recording a value once it is mapped, but a row mapped in THIS session has
    // not reached it yet — so the filter has to be here too.
    render(
      <StatusVocabularyStep
        labels={{ shipped: 'Sent' }}
        seen={['shipped', 'delayed']}
        onChange={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: 'shipped' })).toBeNull();
    // CONTROL: the unmapped one IS offered, so the filter is not simply hiding everything.
    expect(screen.getByRole('button', { name: 'delayed' })).toBeTruthy();
  });

  it('refuses to add with only one half filled in', async () => {
    const onChange = vi.fn();
    render(<StatusVocabularyStep labels={{}} seen={[]} onChange={onChange} />);

    await userEvent.type(screen.getByLabelText(/status value/i), 'in_transit');

    expect(screen.getByRole('button', { name: 'Add' })).toHaveProperty('disabled', true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('proposes no wording of its own', () => {
    // The owner's decision: the admin writes the words. A placeholder is an example, not a
    // default — nothing is pre-filled into the value the map would store.
    render(<StatusVocabularyStep labels={{}} seen={['delayed']} onChange={vi.fn()} />);

    expect(screen.getByLabelText(/what agents read$/i)).toHaveProperty('value', '');
  });
});

describe('a vendor status that collides with Object.prototype', () => {
  it('🔴 still offers `toString` as unmapped — `in` would hide it', () => {
    render(<StatusVocabularyStep labels={{ shipped: 'Sent' }} seen={['toString']} onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'toString' })).toBeInTheDocument();
  });

  it('CONTROL: a value the admin HAS mapped is not offered again', () => {
    render(<StatusVocabularyStep labels={{ shipped: 'Sent' }} seen={['shipped']} onChange={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'shipped' })).not.toBeInTheDocument();
  });
});
