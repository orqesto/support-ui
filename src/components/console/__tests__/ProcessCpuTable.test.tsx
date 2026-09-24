/**
 * S3: the console names the processes using the container's CPU. Taco read 97% with the backend
 * at 8–14%; the rest had no name on this page.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProcessCpuTable } from '../ProcessCpuTable';

describe('ProcessCpuTable', () => {
  it('lists each process with its role, cores and share of the container', () => {
    render(
      <ProcessCpuTable
        report={{
          available: true,
          intervalMs: 10_000,
          processes: [
            { pid: 11, name: 'node embeddingWorker.cjs', role: 'embedding', cores: 0.95, percent: 47.5, rssMB: 480 },
            { pid: 10, name: 'node index.cjs', role: 'backend', cores: 0.12, percent: 6, rssMB: 400 },
          ],
        }}
      />
    );
    expect(screen.getAllByText(/node embeddingWorker\.cjs/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Embedding model').length).toBeGreaterThan(0);
    expect(screen.getAllByText('0.95').length).toBeGreaterThan(0);
    expect(screen.getAllByText('47.5%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Backend').length).toBeGreaterThan(0);
  });

  it('says it is measuring on the first sample instead of showing zeros', () => {
    render(
      <ProcessCpuTable
        report={{
          available: true,
          intervalMs: null,
          processes: [{ pid: 10, name: 'node index.cjs', role: 'backend', cores: null, percent: null, rssMB: 400 }],
        }}
      />
    );
    expect(screen.getAllByText('measuring…').length).toBeGreaterThan(0);
    expect(screen.queryByText('0.00')).toBeNull();
  });

  it('says why when the backend cannot read /proc', () => {
    render(<ProcessCpuTable report={{ available: false, reason: 'cannot read /proc: ENOENT' }} />);
    expect(screen.getByText(/Per-process CPU unavailable \(cannot read \/proc: ENOENT\)/)).toBeTruthy();
  });

  it('renders nothing against an older backend that does not send the field', () => {
    const { container } = render(<ProcessCpuTable report={undefined} />);
    expect(container.textContent).toBe('');
  });
});
