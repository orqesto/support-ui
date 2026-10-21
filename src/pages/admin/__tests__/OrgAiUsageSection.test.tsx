/** Before Apply the old monthly AI-call cap still refuses work, so the admin view keeps its limit. */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { OrgAiUsageSection } from '../AdminUsageOrgDetailSections';

afterEach(cleanup);

const aiCalls = {
  current: 3200,
  limit: 4000,
  percentage: 80,
  warning: true,
  critical: false,
  formatted: '3200 / 4000',
};

describe('OrgAiUsageSection', () => {
  it('before Apply: shows used / limit and the approaching-limit warning, never "not a limit"', () => {
    render(<OrgAiUsageSection aiCalls={aiCalls} />);
    expect(screen.getByTestId('ai-calls-limit')).toHaveTextContent('3,200 / 4,000');
    expect(screen.getByText(/Approaching AI call limit \(80% used\)/)).toBeInTheDocument();
    expect(screen.queryByText(/a statistic, not a limit/)).toBeNull();
  });

  it('after Apply: a statistic, no limit and no warning', () => {
    render(<OrgAiUsageSection aiCalls={aiCalls} budgetsActive />);
    expect(screen.getByText(/a statistic, not a limit/)).toBeInTheDocument();
    expect(screen.queryByTestId('ai-calls-limit')).toBeNull();
    expect(screen.queryByText(/Approaching AI call limit/)).toBeNull();
  });
});
