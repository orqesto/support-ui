/**
 * KB consolidation #873 (FE audits 4-5): what the Cases page says about entries the nightly job
 * has not labelled — by labelling mode ('production' | 'dry_run' | 'off') and by the bound
 * (`classifying.beyondBound`: older entries past the bound that are still UNCLASSIFIED).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { KbCasesReport } from '@/services/kbConsolidation.service';
import { report, row, zeroFindings } from '@/test/kbCasesReportFixture';

vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const { KbCasesReportView } = await import('../KbCasesPage');

const view = (data: KbCasesReport) =>
  render(
    <MemoryRouter>
      <KbCasesReportView report={data} />
    </MemoryRouter>
  );

afterEach(cleanup);

describe('KB Cases report — labelling and the bound', () => {
  it('a big mailbox in its steady state (all old entries labelled) still says the bound bit', () => {
    // Every input past the bound is labelled (beyondBound 0): it keeps its label, but the job does
    // not propose or attach it any more. A bound must report that it bit.
    view(
      report({
        bounded: true,
        classifying: { settled: 5000, total: 5000, beyondBound: 0, outOfReach: 1000 },
      })
    );
    const notice = screen.getByText(
      "1000 older answers are past the nightly job's limit: they keep their labels, but the nightly job does not propose them as new cases."
    );
    expect(notice).not.toHaveTextContent(/mailbox|not classified/i);
    expect(screen.queryByText(/Classifying:/)).not.toBeInTheDocument();
  });

  it('entries already in a pending proposal are not said to be "never proposed" (MED-1)', () => {
    // A proposal made while they were still within reach stays pending and shows as a
    // "proposed" row with Review — so the notice speaks only of what the job does next.
    view(
      report({
        bounded: true,
        classifying: { settled: 5000, total: 5000, beyondBound: 0, outOfReach: 1000 },
        headers: [
          {
            label: 'refund',
            language: 'en',
            conversations: 3,
            rows: [
              row({ kind: 'proposed', title: 'proposed case — awaiting review', suggestionId: 70 }),
            ],
          },
        ],
      })
    );
    expect(screen.getByRole('link', { name: 'Review' })).toBeInTheDocument();
    const notice = screen.getByText(/older answers are past the nightly job's limit/);
    expect(notice).not.toHaveTextContent(/never proposed/);
    expect(notice).toHaveTextContent(/does not propose them as new cases/);
  });

  it('under a search with no rows, the notice claims nothing about what is shown (LOW-1)', () => {
    render(
      <MemoryRouter>
        <KbCasesReportView
          report={report({
            bounded: true,
            headers: [],
            classifying: { settled: 5000, total: 5000, beyondBound: 0, outOfReach: 1000 },
          })}
          search="zzz"
        />
      </MemoryRouter>
    );
    expect(screen.getByText('No case matches “zzz”.')).toBeInTheDocument();
    const notice = screen.getByText(/older answers are past the nightly job's limit/);
    expect(notice).not.toHaveTextContent(/shown here/);
  });

  it('nothing out of reach: no bound notice', () => {
    view(report({ classifying: { settled: 5000, total: 5000, beyondBound: 0, outOfReach: 0 } }));
    expect(document.body.textContent).not.toMatch(/nightly job|never proposed/);
  });

  it('entries within reach in a bounded scope are counted against a reachable total', () => {
    view(
      report({
        headers: [],
        footer: { belowQualityBar: 0 },
        findings: zeroFindings,
        bounded: true,
        classifying: { settled: 4990, total: 5000, beyondBound: 1000, outOfReach: 1000 },
      })
    );
    expect(screen.getByText('Classifying: 4990 of 5000')).toBeInTheDocument();
    expect(
      screen.getByText(
        '10 learned answers are still being classified — what is shown here can still change.'
      )
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/the oldest/);
  });

  it('a dry run is a trial whose results are not shown here — not "not running" (LOW-3)', () => {
    view(
      report({
        headers: [],
        footer: { belowQualityBar: 0 },
        findings: zeroFindings,
        classifying: { settled: 0, total: 5, beyondBound: 0, outOfReach: 0 },
        labellingActive: false,
        labellingMode: 'dry_run',
      })
    );
    const page = document.body.textContent ?? '';
    expect(page).not.toMatch(/not running|being classified|Classifying:/);
    expect(
      screen.getByText(
        '5 learned answers are not classified here — consolidation runs for this workspace only as a trial, and its results are not shown on this page.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Classified: 0 of 5 — consolidation runs only as a trial here; its results are not shown on this page.'
    );
  });
});
