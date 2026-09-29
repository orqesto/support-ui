/**
 * KB consolidation #873 (FE audits 4-5): what the Cases page says about entries the nightly job
 * has not labelled — by labelling mode ('production' | 'dry_run' | 'off') and by the bound
 * (`classifying.beyondBound`) — and how it reads a backend that predates those fields.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { KbCasesReport } from '@/services/kbConsolidation.service';
import { olderBackend, report, zeroFindings } from '@/test/kbCasesReportFixture';

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
  it('a bounded scope with nothing beyond the bound here makes no bound claim (LOW-1)', () => {
    // `bounded` is per mailbox scope; `beyondBound` counts THIS department's entries.
    view(report({ bounded: true, classifying: { settled: 50, total: 50, beyondBound: 0 } }));
    expect(document.body.textContent).not.toMatch(/nightly limit|only the newest|nightly job/);
    expect(screen.queryByText(/Classifying:/)).not.toBeInTheDocument();
  });

  it('entries within reach in a bounded scope are counted against a reachable total', () => {
    view(
      report({
        headers: [],
        footer: { belowQualityBar: 0 },
        findings: zeroFindings,
        bounded: true,
        classifying: { settled: 4990, total: 5000, beyondBound: 1000 },
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

  it('older backend: the bounded notice keeps its previous wording', () => {
    view(olderBackend(report({ bounded: true })));
    expect(
      // An older answer labelled while it was among the newest keeps its label and is grouped:
      // nothing may read as if every older answer were unclassified.
      screen.getByText(
        'A mailbox here has more learned answers than the nightly job reads, so it classifies and proposes as cases only the newest. Older answers it labelled before are still grouped here.'
      )
    ).toBeInTheDocument();
  });

  it('older backend, labelling not running: the bounded notice says what will happen once it runs (LOW-2)', () => {
    view(olderBackend(report({ bounded: true, labellingActive: false })));
    expect(
      screen.getByText(
        'A mailbox here has more learned answers than the nightly job would read — once it runs, it will classify and propose only the newest. Older answers labelled before stay grouped.'
      )
    ).toBeInTheDocument();
  });

  it('a dry run is a trial whose results are not shown here — not "not running" (LOW-3)', () => {
    view(
      report({
        headers: [],
        footer: { belowQualityBar: 0 },
        findings: zeroFindings,
        classifying: { settled: 0, total: 5, beyondBound: 0 },
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

  it('older backend without labellingMode: labellingActive false still reads "not running"', () => {
    view(
      olderBackend(
        report({
          headers: [],
          footer: { belowQualityBar: 0 },
          findings: zeroFindings,
          classifying: { settled: 0, total: 5 },
          labellingActive: false,
        })
      )
    );
    expect(
      screen.getByText(
        '5 learned answers are not classified — consolidation is not running for this workspace.'
      )
    ).toBeInTheDocument();
  });
});
