/**
 * The ONE card (2026-10-14): what each state says, to an agent and to an admin. Neutral fixtures,
 * including a lookup with no category and its own reference name — the card must read the same for
 * any kind of record.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CustomApiResultCard } from '../CustomApiResultCard';
import type { CustomApiLookupResult } from '@/services/customApiLookup.service';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';

const card = (over: Partial<CustomApiLookupResult> = {}): CustomApiLookupResult =>
  ({
    endpointId: 20,
    label: 'User details',
    connectionName: 'Acme',
    resultShape: 'one',
    category: null,
    referenceLabel: 'User id',
    status: 'ok',
    rows: [{ id: '7', name: 'Ada' }],
    fields: [
      { path: 'id', label: 'Id', kind: 'plain' },
      { path: 'name', label: 'Name', kind: 'plain' },
    ],
    ...over,
  }) as CustomApiLookupResult;

const asRole = (organizationRole: 'support' | 'org_admin') =>
  useAuthStore.setState({
    selectedOrganizationId: 1,
    user: { id: 9, role: 'user', organizationRole } as User,
  });

type CardProps = Parameters<typeof CustomApiResultCard>[0];

const show = (result: CustomApiLookupResult, extra: Partial<CardProps> = {}) =>
  render(
    <MemoryRouter>
      <CustomApiResultCard
        result={result}
        busy={false}
        referenceInput="card"
        onRunManual={() => {}}
        {...extra}
      />
    </MemoryRouter>
  );

beforeEach(() => asRole('support'));

describe('ownership line — only for a FOUND record', () => {
  it('owned → green "Belongs to this customer"', () => {
    show(card({ ownership: 'owned' }));
    const line = screen.getByText('Belongs to this customer');
    expect(line.parentElement?.className).toContain('text-success');
  });

  it('owned while looking up as another email → "Matches {email}"', () => {
    show(card({ ownership: 'owned' }), { lookedUpAs: 'buyer@example.com' });
    expect(screen.getByText('Matches buyer@example.com')).toBeInTheDocument();
    expect(screen.queryByText('Belongs to this customer')).toBeNull();
  });

  it('⛔ B2: a no-match never shows an ownership line, even if an older backend sent one', () => {
    show(
      card({
        status: 'no_match',
        rows: [],
        ownership: 'mismatch',
        searchedFor: { kind: 'reference', value: '999999' },
      })
    );
    expect(screen.queryByText(/does NOT belong/)).toBeNull();
    expect(screen.getByText('No User id 999999 in Acme.')).toBeInTheDocument();
  });

  it('⛔ B2: an ok with NO rows gets no ownership line either', () => {
    show(card({ status: 'ok', rows: [], ownership: 'mismatch' }));
    expect(screen.queryByText(/does NOT belong/)).toBeNull();
  });

  it('CONTROL: a found mismatch keeps the D38 banner', () => {
    show(card({ ownership: 'mismatch' }));
    expect(screen.getByText(/does NOT belong to this customer/)).toBeInTheDocument();
  });
});

describe('no-match states', () => {
  it('an email search names the email, muted, and offers the typed-value lookup', () => {
    show(
      card({
        status: 'no_match',
        rows: [],
        searchedFor: { kind: 'email', value: 'nobody@example.com' },
      }),
      { referenceHint: 'You can still look up by User id below.' }
    );
    const text = screen.getByText('Nothing in Acme for nobody@example.com.');
    expect(text.className).toContain('text-muted-foreground');
    expect(screen.getByText('You can still look up by User id below.')).toBeInTheDocument();
  });

  it('a skipped chained card says which lookup stopped it', () => {
    show(
      card({
        status: 'no_match',
        rows: [],
        skippedBecause: { reason: 'source_no_match', sourceLabel: 'Account' },
      })
    );
    expect(screen.getByText('Skipped — Account found nothing.')).toBeInTheDocument();
  });

  it('a chain stopped by a source with no email says so', () => {
    show(
      card({
        status: 'no_identity',
        rows: [],
        reason: 'This customer has no email address, so this lookup cannot run.',
        skippedBecause: { reason: 'source_no_identity', sourceLabel: 'Account' },
      })
    );
    expect(
      screen.getByText('Skipped — Account needs the customer’s email, and there is none.')
    ).toBeInTheDocument();
  });

  it('an older backend keeps today’s wording', () => {
    show(card({ status: 'no_match', rows: [], referenceLabel: null }));
    expect(screen.getByText('No matching records for this customer.')).toBeInTheDocument();
  });
});

describe('D1 — failures', () => {
  const failed = card({
    status: 'failed',
    rows: [],
    reason: 'Ray ID 8a1b · key rejected',
    agentReason: 'auth',
  });

  it('an agent sees the sentence and "An admin can see the details", never the raw text', () => {
    show(failed);
    expect(screen.getByText('Acme refused our access.')).toBeInTheDocument();
    expect(screen.getByText('An admin can see the details.')).toBeInTheDocument();
    expect(screen.queryByText(/Ray ID/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Details/ })).toBeNull();
  });

  it('an admin sees the same sentence and a Details toggle with the raw text', async () => {
    asRole('org_admin');
    show(failed);
    expect(screen.getByText('Acme refused our access.')).toBeInTheDocument();
    expect(screen.queryByText(/Ray ID/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Details/ }));
    expect(screen.getByText(/Ray ID 8a1b/)).toBeInTheDocument();
  });

  it('⛔ an OLDER backend (no class): an agent sees the generic sentence, never the reason', () => {
    show(card({ status: 'failed', rows: [], reason: 'The vendor refused the request: "bad key"' }));
    expect(screen.getByText('This lookup could not be completed.')).toBeInTheDocument();
    expect(screen.queryByText(/bad key/)).toBeNull();
  });

  it('the no-longer-available card reads its own sentence, to everyone', () => {
    show(card({ status: 'failed', rows: [], agentReason: 'unavailable', connectionName: '' }));
    expect(screen.getByText(/no longer available/)).toBeInTheDocument();
    expect(screen.queryByText('An admin can see the details.')).toBeNull();
  });

  it('a skipped card that failed names its source and the class sentence', () => {
    show(
      card({
        status: 'failed',
        rows: [],
        agentReason: 'timeout',
        skippedBecause: { reason: 'source_failed', sourceLabel: 'Account' },
      })
    );
    expect(screen.getByText('Skipped — Account could not be completed.')).toBeInTheDocument();
    expect(screen.getByText('Acme took too long to answer.')).toBeInTheDocument();
  });

  it('shape_changed: an agent is sent to an admin and sees no paths', () => {
    show(
      card({ status: 'shape_changed', rows: [], missing: ['data.items'], missingKind: 'fields' })
    );
    expect(screen.getByText('This lookup needs attention from an admin.')).toBeInTheDocument();
    expect(screen.queryByText(/data\.items/)).toBeNull();
  });

  it('shape_changed: an admin sees the paths', () => {
    asRole('org_admin');
    show(
      card({ status: 'shape_changed', rows: [], missing: ['data.items'], missingKind: 'fields' })
    );
    expect(screen.getByText(/data\.items not found/)).toBeInTheDocument();
  });
});

describe('the reference input', () => {
  it('placeholder and label are the reference name; the button stays on one line', () => {
    show(card({ status: 'needs_input', rows: [] }));
    expect(screen.getByPlaceholderText('User id')).toBeInTheDocument();
    expect(screen.getByLabelText('User id for User details')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Look up' }).className).toContain(
      'whitespace-nowrap'
    );
  });

  it('no reference name (older backend) → "Reference"', () => {
    show(card({ status: 'needs_input', rows: [], referenceLabel: null }));
    expect(screen.getByPlaceholderText('Reference')).toBeInTheDocument();
  });

  it('the records page uses its own box: the card says where to type', () => {
    show(card({ status: 'needs_input', rows: [] }), { referenceInput: 'page' });
    expect(screen.getByText('Type a reference above to check this one.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
