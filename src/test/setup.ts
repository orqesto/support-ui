import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { invalidateSharedFetch } from '@/lib/sharedFetch';
import { cleanup } from '@testing-library/react';

// vitest runs with `globals: false`, so @testing-library/react never registers its own
// afterEach(cleanup) — that hook is only installed when the globals are present. Without
// this, every render in a file stays in document.body for the rest of the file, and a
// getByRole that should match one element starts finding several. Silent until two tests
// in one file render the same control.
afterEach(cleanup);
// Shared answers (sharedFetch) must not leak from one test into the next.
afterEach(() => invalidateSharedFetch());

// The app loads the rich-text editor lazily (LazyRichTextEditor: TipTap is not in the inbox
// bundle). Tests render it synchronously, as before — through whatever a test file mocks
// '@/components/shared/RichTextEditor' as. LazyRichTextEditor.test.tsx unmocks this to test the
// lazy path itself.
vi.mock('@/components/shared/LazyRichTextEditor', async () => {
  const editor = await import('@/components/shared/RichTextEditor');
  return { default: editor.default };
});
