import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// vitest runs with `globals: false`, so @testing-library/react never registers its own
// afterEach(cleanup) — that hook is only installed when the globals are present. Without
// this, every render in a file stays in document.body for the rest of the file, and a
// getByRole that should match one element starts finding several. Silent until two tests
// in one file render the same control.
afterEach(cleanup);
