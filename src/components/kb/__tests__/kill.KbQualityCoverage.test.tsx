/**
 * KB quality review — mutation-survivor kills for the coverage line (Stryker, 2026-10-04).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { KbQualityStatus } from '@/services/kbQuality.service';

const getStatus = vi.fn<() => Promise<KbQualityStatus | 'unsupported' | 'error'>>();
vi.mock('@/services/kbQuality.service', () => ({ kbQualityService: { getStatus: () => getStatus() } }));

const { KbQualityCoverage, describeQualityStatus } = await import('../KbQualityCoverage');

const NOW = Date.parse('2026-10-10T12:00:00.000Z');
const on = (over: Partial<KbQualityStatus['coverage']> = {}): KbQualityStatus => ({
  state: 'on',
  coverage: { entries: 10, checked: 10, notYet: 0, unassessed: 0, rewritesWaiting: 0, lastCheckedAt: '2026-10-09T05:00:00.000Z', ...over },
});

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('describeQualityStatus — each part only when it is true', () => {
  it('a fully checked KB names no backlog, no unassessed, no waiting rewrites — and when it was last checked', () => {
    const { variant, text } = describeQualityStatus(on(), NOW);
    expect(variant).toBe('default');
    expect(text).toMatch(/^Checked 10 of 10 learned entries \(100%\)\. Last checked /);
    expect(text).not.toMatch(/not checked yet|could not be assessed|rewrites/);
  });

  it('names waiting rewrites', () => {
    expect(describeQualityStatus(on({ rewritesWaiting: 3 }), NOW).text).toContain('3 rewrites are still to be written.');
  });

  it('an empty KB says so, and nothing else', () => {
    expect(describeQualityStatus(on({ entries: 0, checked: 0, lastCheckedAt: null }), NOW)).toEqual({
      variant: 'default',
      text: 'There are no learned entries to check yet.',
    });
  });

  it('two days without a check while entries wait is not yet a stall', () => {
    const { variant, text } = describeQualityStatus(on({ checked: 5, notYet: 5, lastCheckedAt: '2026-10-08T12:00:00.000Z' }), NOW);
    expect(variant).toBe('default');
    expect(text).toContain('Last checked');
    expect(text).not.toContain('may be failing');
  });

  it('a stall names the date it stopped', () => {
    const { text } = describeQualityStatus(on({ checked: 5, notYet: 5, lastCheckedAt: '2026-10-01T12:00:00.000Z' }), NOW);
    expect(text).toContain(new Date('2026-10-01T12:00:00.000Z').toLocaleDateString());
  });

  it('no last check and nothing waiting: no stall, no date', () => {
    const { variant, text } = describeQualityStatus(on({ lastCheckedAt: null }), NOW);
    expect(variant).toBe('default');
    expect(text).not.toMatch(/Last checked|Nothing has been checked/);
  });
});

describe('KbQualityCoverage', () => {
  it('renders the status line', async () => {
    getStatus.mockResolvedValue(on());
    render(<KbQualityCoverage />);
    expect(await screen.findByTestId('kb-quality-coverage')).toHaveTextContent('Checked 10 of 10');
  });

  it('says when the status could not be loaded — never silently shows nothing', async () => {
    getStatus.mockResolvedValue('error');
    render(<KbQualityCoverage />);
    expect(await screen.findByTestId('kb-quality-coverage')).toHaveTextContent('Could not load how much');
  });

  it('shows nothing against a backend without the route', async () => {
    getStatus.mockResolvedValue('unsupported');
    const { container } = render(<KbQualityCoverage />);
    await waitFor(() => expect(getStatus).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it('re-reads when the list changes, and only then', async () => {
    getStatus.mockResolvedValue(on());
    const { rerender } = render(<KbQualityCoverage reloadKey={3} />);
    await screen.findByTestId('kb-quality-coverage');
    rerender(<KbQualityCoverage reloadKey={3} />);
    expect(getStatus).toHaveBeenCalledTimes(1);
    getStatus.mockResolvedValue(on({ checked: 4, notYet: 6 }));
    rerender(<KbQualityCoverage reloadKey={2} />);
    await waitFor(() => expect(screen.getByTestId('kb-quality-coverage')).toHaveTextContent('Checked 4 of 10'));
    expect(getStatus).toHaveBeenCalledTimes(2);
  });

  it('an answer that arrives after unmount is dropped', async () => {
    let resolve: (value: KbQualityStatus) => void = () => {};
    getStatus.mockReturnValue(new Promise((done) => (resolve = done)));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<KbQualityCoverage />);
    unmount();
    resolve(on());
    await new Promise((done) => setTimeout(done, 0));
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
