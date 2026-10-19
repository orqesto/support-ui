/**
 * Budget model DEMO on the AI Spend page: both views render, the demo banner is there, a row opens
 * its panel directly under itself, granting extra changes the status — and nothing reaches the
 * network (the demo has no backend: every request path is a spy that must stay untouched).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const apiCalls = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/lib/api-client', () => {
  const record = () => {
    apiCalls.count += 1;
    return Promise.reject(new Error('the demo must not call the API'));
  };
  return {
    apiClient: {
      get: record,
      post: record,
      put: record,
      patch: record,
      delete: record,
      request: record,
    },
  };
});

const { BudgetModelDemoSection } = await import('../BudgetModelDemoSection');

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  apiCalls.count = 0;
  fetchSpy = vi.fn(() => Promise.reject(new Error('no network in the demo')));
  vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(apiCalls.count).toBe(0);
  vi.unstubAllGlobals();
  cleanup();
});

const orgView = () => within(screen.getByTestId('budget-demo-view-organisation'));
const singleView = () => within(screen.getByTestId('budget-demo-view-single'));
const rowButton = (name: string) =>
  orgView()
    .getAllByRole('button', { expanded: false })
    .concat(orgView().queryAllByRole('button', { expanded: true }))
    .find((element) => element.textContent?.includes(name));

describe('Budget model demo', () => {
  it('shows the banner and both tabs, organisation first', () => {
    render(<BudgetModelDemoSection />);
    expect(screen.getByRole('heading', { name: 'Budget model (demo)' })).toBeInTheDocument();
    expect(
      screen.getByText('Demo · proposed budget model · example numbers, nothing is saved')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Organisation (many workspaces)' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Single workspace' })).toBeInTheDocument();

    expect(screen.getByTestId('budget-demo-view-organisation')).toBeVisible();
    expect(screen.getByTestId('budget-demo-view-single')).not.toBeVisible();
    expect(
      orgView().getByText(/Example organisation · 24 workspaces · 19 Oct 2026/)
    ).toBeInTheDocument();
    expect(orgView().getByTestId('budget-demo-org-status')).toHaveTextContent(
      'All running. Knowledge base has'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Single workspace' }));
    expect(screen.getByTestId('budget-demo-view-single')).toBeVisible();
    expect(singleView().getByText('Lakeside Dental')).toBeInTheDocument();
    expect(singleView().getByTestId('budget-demo-single-status')).toHaveTextContent(
      'All running. Knowledge base has 11.0M left; live mail has 23.0M.'
    );
  });

  it('lists the top 8 by use, with Show all and search', () => {
    render(<BudgetModelDemoSection />);
    const rows = () => orgView().getAllByTestId(/^budget-demo-row-[wn]\d+$/);
    expect(rows()).toHaveLength(8);
    expect(rows()[0]).toHaveTextContent('Northwind Shop');
    fireEvent.click(orgView().getByRole('button', { name: 'Show all 24' }));
    expect(rows()).toHaveLength(24);
    fireEvent.change(orgView().getByRole('searchbox', { name: 'Search workspaces' }), {
      target: { value: 'dental' },
    });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent('River Dental');
  });

  it('expanding a row shows its panel directly under it (click and keyboard)', () => {
    render(<BudgetModelDemoSection />);
    const row = rowButton('Atlas Labs');
    expect(row).toBeDefined();
    if (!row) return;
    expect(row).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');

    const panel = document.getElementById(row.getAttribute('aria-controls') ?? '');
    expect(panel).not.toBeNull();
    // The panel is the row's next sibling inside the same list item.
    expect(row.nextElementSibling).toBe(panel);
    expect(within(panel as HTMLElement).getByText('Limit this workspace')).toBeInTheDocument();
    expect(
      within(panel as HTMLElement).getByText('Extra for the knowledge base')
    ).toBeInTheDocument();
    expect(
      within(panel as HTMLElement).getByRole('slider', { name: 'Limit for Atlas Labs' })
    ).toHaveValue('30');

    fireEvent.keyDown(row, { key: 'Enter' });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(row, { key: ' ' });
    expect(row).toHaveAttribute('aria-expanded', 'true');
  });

  it('dragging the limit keeps the same slider element (no re-mount mid-drag)', () => {
    render(<BudgetModelDemoSection />);
    const row = rowButton('Atlas Labs');
    if (!row) throw new Error('row missing');
    fireEvent.click(row);
    const slider = orgView().getByRole('slider', { name: 'Limit for Atlas Labs' });
    fireEvent.change(slider, { target: { value: '20' } });
    fireEvent.change(slider, { target: { value: '25' } });
    expect(orgView().getByRole('slider', { name: 'Limit for Atlas Labs' })).toBe(slider);
    expect(slider).toHaveValue('25');
    // 28M used, limit 25: its KB stops, live mail continues.
    expect(
      orgView().getByText(
        'Below what it already used: its knowledge base stops now; live mail continues.'
      )
    ).toBeInTheDocument();
    expect(orgView().getByTestId('budget-demo-row-status-w1')).toHaveTextContent(
      'KB stopped: reached its own limit (25.0M) · live mail continues'
    );
  });

  it('granting extra changes the workspace status', () => {
    render(<BudgetModelDemoSection />);
    // Push the organisation past its KB line so the import on Delta Logistics pauses.
    fireEvent.change(orgView().getByLabelText('Monthly budget'), { target: { value: '300' } });
    expect(orgView().getByTestId('budget-demo-org-status')).toHaveTextContent(
      /^Knowledge base paused/
    );
    const status = orgView().getByTestId('budget-demo-row-status-w4');
    expect(status).toHaveTextContent('KB import paused · live mail continues');

    const row = rowButton('Delta Logistics');
    if (!row) throw new Error('row missing');
    fireEvent.click(row);
    fireEvent.click(orgView().getByRole('button', { name: 'Today' }));
    fireEvent.click(orgView().getByRole('button', { name: /^Give \+25\.0M · ends today$/ }));
    expect(status).toHaveTextContent('KB import on extra · 25.0M left · ends today');
    expect(orgView().getByRole('button', { name: 'End now' })).toBeInTheDocument();
  });

  it('the KB line on the bar never goes below 50%, in both views', () => {
    render(<BudgetModelDemoSection />);
    const [orgSlider] = orgView().getAllByRole('slider', {
      name: 'Knowledge base may use at most, percent of the budget',
    });
    fireEvent.change(orgSlider, { target: { value: '20' } });
    expect(orgSlider).toHaveValue('50');

    fireEvent.click(screen.getByRole('button', { name: 'Single workspace' }));
    const singleSlider = singleView().getByRole('slider', {
      name: 'Knowledge base may use at most, percent of the budget',
    });
    fireEvent.change(singleSlider, { target: { value: '10' } });
    expect(singleSlider).toHaveValue('50');
  });

  it('try it: +1 day, add and remove a workspace, reset', () => {
    render(<BudgetModelDemoSection />);
    fireEvent.click(orgView().getByRole('button', { name: '+1 day' }));
    expect(orgView().getByTestId('budget-demo-org-log')).toHaveTextContent(/^20 Oct:/);

    fireEvent.click(orgView().getByRole('button', { name: 'Add a workspace' }));
    expect(orgView().getByTestId('budget-demo-org-log')).toHaveTextContent(
      'New workspace 1 joined with no own limit'
    );
    // The new workspace opens straight away.
    expect(
      orgView().getByRole('slider', { name: 'Limit for New workspace 1' })
    ).toBeInTheDocument();

    fireEvent.click(orgView().getByRole('button', { name: 'Remove workspace' }));
    expect(orgView().getByTestId('budget-demo-org-log')).toHaveTextContent(
      'New workspace 1 removed. Its 0.0M spent this month still counts'
    );

    fireEvent.click(orgView().getByRole('button', { name: 'Reset' }));
    expect(orgView().getByText(/19 Oct 2026/)).toBeInTheDocument();
    expect(orgView().getByTestId('budget-demo-org-log')).toHaveTextContent('');
  });

  it('single workspace: start an import, +1 day, give extra', () => {
    render(<BudgetModelDemoSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Single workspace' }));
    fireEvent.click(singleView().getByRole('button', { name: 'Start a 30M KB import' }));
    expect(singleView().getByTestId('budget-demo-single-log')).toHaveTextContent(
      'A 30M KB import started.'
    );
    fireEvent.click(singleView().getByRole('button', { name: '+1 day' }));
    fireEvent.click(singleView().getByRole('button', { name: '+1 day' }));
    expect(singleView().getByTestId('budget-demo-single-status')).toHaveTextContent(
      /^Knowledge base paused at 48.0M/
    );
    fireEvent.click(singleView().getByRole('button', { name: /^Give \+20\.0M/ }));
    expect(singleView().getByTestId('budget-demo-single-status')).toHaveTextContent(
      'the import continues on its extra (20.0M left)'
    );
  });
});
