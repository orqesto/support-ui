import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Department } from '@/types';
import type * as teamBuilderModule from '../../../services/teamBuilder.service';

const api = vi.hoisted(() => ({ setRole: vi.fn() }));
const setRole = api.setRole;
vi.mock('../../../services/teamBuilder.service', async (importOriginal) => ({
  ...(await importOriginal<typeof teamBuilderModule>()),
  teamBuilderService: { setRole: api.setRole },
}));

import { ApplyResultSummary } from '../ApplyResultSummary';
import { TeamRolesEditor } from '../TeamRolesEditor';

const team = (over: Partial<Department>): Department =>
  ({ id: 1, name: 'Support', color: null, active: true, isDefault: false, ...over }) as Department;

beforeEach(() => {
  setRole.mockReset();
});

const refusal = (status: number, data: object) =>
  Object.assign(new Error('refused'), { status, data });

describe('ApplyResultSummary', () => {
  it('shows counts, each failed item with its reason, the notice and the NO_ROUTING_RULES warning', () => {
    const result: teamBuilderModule.ApplyResult = {
      inserted: 12,
      alreadyPresent: 3,
      retired: 2,
      failed: [
        { name: 'Refund wording', flow: 'prompts', code: 'MISSING_ITEM' },
        { name: 'Sender list', flow: 'spam', code: 'WORKSPACE_WIDE_ITEM' },
        { name: 'Odd rule', flow: 'routing', code: 'WRITE_FAILED' },
        { name: 'Invoices', flow: 'routing', code: 'NOT_IN_EFFECT' },
        { name: 'Unknown reason', flow: 'routing', code: 'SOMETHING_NEW' },
      ],
      rolesSet: [],
      previousHolders: [],
    };
    render(
      <ApplyResultSummary
        result={result}
        notice="rules_only_until_traffic"
        warnings={['NO_ROUTING_RULES']}
      />
    );
    expect(screen.getByText('12 rules added')).toBeInTheDocument();
    expect(screen.getByText('3 were already on this team')).toBeInTheDocument();
    expect(screen.getByText('2 were archived in the library and left out')).toBeInTheDocument();
    expect(
      screen.getByText('Refund wording (Prompts): no longer in the library')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Sender list (Spam): applies to the whole workspace, not one team')
    ).toBeInTheDocument();
    expect(screen.getByText('Odd rule (Routing): could not be saved; try again')).toBeInTheDocument();
    expect(screen.getByText(/^Invoices \(Routing\): this team already has it, but it is switched off/)).toBeInTheDocument();
    // CONTROL: a code the page does not know still gets a reason.
    expect(screen.getByText('Unknown reason (Routing): could not be added')).toBeInTheDocument();
    expect(screen.getByText(/starts with rules only/)).toBeInTheDocument();
    expect(screen.getByText(/No routing rules came with it/)).toBeInTheDocument();
  });
});

describe('ApplyResultSummary plural', () => {
  it('says "1 rule added" for one', () => {
    render(
      <ApplyResultSummary
        result={{ inserted: 1, alreadyPresent: 0, retired: 0, failed: [], rolesSet: [], previousHolders: [] }}
      />
    );
    expect(screen.getByText('1 rule added')).toBeInTheDocument();
  });

  it('says "was" for one already present or archived item', () => {
    render(
      <ApplyResultSummary
        result={{ inserted: 0, alreadyPresent: 1, retired: 1, failed: [], rolesSet: [], previousHolders: [] }}
      />
    );
    expect(screen.getByText('1 was already on this team')).toBeInTheDocument();
    expect(screen.getByText(/^1 was archived in the library/)).toBeInTheDocument();
  });

  it('lists two failures with the same name, flow and code as two items, without a duplicate-key warning', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const twin = { name: 'Twin', flow: 'spam', code: 'MISSING_ITEM' };
    render(
      <ApplyResultSummary
        result={{ inserted: 0, alreadyPresent: 0, retired: 0, failed: [twin, twin], rolesSet: [], previousHolders: [] }}
      />
    );
    expect(screen.getAllByText('Twin (Spam): no longer in the library')).toHaveLength(2);
    expect(spy.mock.calls.some((call) => String(call[0]).includes('same key'))).toBe(false);
    spy.mockRestore();
  });
});

describe('TeamRolesEditor', () => {
  const sales = team({ id: 2, name: 'Sales', billingExtraction: true });
  const mine = team({ id: 1, name: 'Support' });

  it('turning on Billing details held by Sales asks first; Keep sends nothing; Move sends the role', async () => {
    setRole.mockResolvedValue(undefined);
    const onChanged = vi.fn();
    render(<TeamRolesEditor team={mine} teams={[mine, sales]} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole('switch', { name: 'Billing details' }));
    expect(
      screen.getByText('Billing details is held by Sales. Move it to this team?')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep it there' }));
    expect(setRole).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('switch', { name: 'Billing details' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move it here' }));
    await waitFor(() => expect(setRole).toHaveBeenCalledWith(1, 'billingExtraction', true));
    expect(setRole).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('a role held only by an inactive team moves without asking', async () => {
    setRole.mockResolvedValue(undefined);
    const dormant = team({ id: 3, name: 'Old', active: false, billingExtraction: true });
    render(<TeamRolesEditor team={mine} teams={[mine, dormant]} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Billing details' }));
    expect(screen.queryByText(/is held by/)).not.toBeInTheDocument();
    await waitFor(() => expect(setRole).toHaveBeenCalledWith(1, 'billingExtraction', true));
  });

  it('turning off a role this team holds asks nothing', async () => {
    setRole.mockResolvedValue(undefined);
    const holder = team({ id: 1, billingExtraction: true });
    render(<TeamRolesEditor team={holder} teams={[holder, sales]} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Billing details' }));
    expect(screen.queryByText(/is held by/)).not.toBeInTheDocument();
    await waitFor(() => expect(setRole).toHaveBeenCalledWith(1, 'billingExtraction', false));
  });

  it('Escape on the roles-held dialog counts as Keep', async () => {
    render(<TeamRolesEditor team={mine} teams={[mine, sales]} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Billing details' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(setRole).not.toHaveBeenCalled();
  });

  it('while a Move is in flight the switches and dialog buttons are inactive', async () => {
    let finish: () => void = () => undefined;
    setRole.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    render(<TeamRolesEditor team={mine} teams={[mine, sales]} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Billing details' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move it here' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Move it here' })).toBeInactive()
    );
    expect(screen.getByRole('button', { name: 'Keep it there' })).toBeInactive();
    expect(screen.getAllByRole('switch')[0]).toBeInactive();
    finish();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('turning off the last General rules shows the server reason', async () => {
    const general = team({ generalRules: true });
    setRole.mockRejectedValue(
      refusal(409, { code: 'GENERAL_TEAM_REQUIRED', error: 'server words' })
    );
    render(<TeamRolesEditor team={general} teams={[general]} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('switch', { name: 'General rules' }));
    expect(
      await screen.findByText('A workspace keeps one team with General rules.')
    ).toBeInTheDocument();
  });

  it('shows the server message for any other refusal', async () => {
    setRole.mockRejectedValue(refusal(400, { error: 'Nope, not now' }));
    render(<TeamRolesEditor team={mine} teams={[mine]} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Promotional mail' }));
    expect(await screen.findByText('Nope, not now')).toBeInTheDocument();
  });
});
