/**
 * KB consolidation #873 (FE audits 4-5): what the Cases page says about entries the nightly job
 * has not labelled — by labelling mode ('production' | 'dry_run' | 'off') and by the bound
 * (`classifying.beyondBound`: older entries past the bound that are still UNCLASSIFIED).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { KbCasesReport } from '@/services/kbConsolidation.service';
import { report, zeroFindings } from '@/test/kbCasesReportFixture';

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
    // Every input past the bound is labelled (beyondBound 0), so it is shown — but the job never
    // proposes or attaches it. A bound must report that it bit.
    view(
      report({
        bounded: true,
        classifying: { settled: 5000, total: 5000, beyondBound: 0, outOfReach: 1000 },
      })
    );
    const notice = screen.getByText(
      "1000 older answers are past the nightly job's limit: they are shown here, but never proposed as cases."
    );
    expect(notice).not.toHaveTextContent(/mailbox|not classified/i);
    expect(screen.queryByText(/Classifying:/)).not.toBeInTheDocument();
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
