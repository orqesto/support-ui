import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LoadingOverlay } from '../LoadingOverlay';

afterEach(cleanup);

describe('LoadingOverlay', () => {
  it('shades the content with the app’s big loader and the label, as a status', () => {
    const { container } = render(
      <LoadingOverlay active label="Searching…">
        <p>old rows</p>
      </LoadingOverlay>
    );
    expect(screen.getByRole('status', { name: 'Searching…' })).toBeInTheDocument();
    expect(screen.getByText('Searching…')).toBeInTheDocument();
    expect(container.querySelector('.animate-spin.w-12.h-12')).not.toBeNull();
    // The old rows stay on screen under the shade.
    expect(screen.getByText('old rows')).toBeInTheDocument();
    expect(container.firstElementChild?.getAttribute('aria-busy')).toBe('true');
  });

  it('renders the content untouched when not active (control)', () => {
    const { container } = render(
      <LoadingOverlay active={false} label="Searching…">
        <p>rows</p>
      </LoadingOverlay>
    );
    expect(screen.queryByRole('status')).toBeNull();
    expect(container.querySelector('.animate-spin')).toBeNull();
  });
});
