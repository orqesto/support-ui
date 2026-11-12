import '@testing-library/jest-dom/vitest';
import { afterEach, expect, vi } from 'vitest';
import { invalidateSharedFetch } from '@/lib/sharedFetch';
import { resetRoleDefaultsUnavailableForTests } from '@/services/notificationRoleDefaultsMemory';
import { cleanup } from '@testing-library/react';
import { toBeInactive } from '@/test/inactive';
import { clearAllUnsentDrafts, resetUnsentDraftPruneForTests } from '@/lib/unsentDrafts';
import { clearLookupCache } from '@/lib/lookupResultCache';

// A Button out of use is aria-disabled, never natively disabled (it keeps keyboard focus):
// `toBeInactive()` sees both; jest-dom's `toBeDisabled()` does not (src/test/inactive.ts).
expect.extend({ toBeInactive });

// vitest runs with `globals: false`, so @testing-library/react never registers its own
// afterEach(cleanup) — that hook is only installed when the globals are present. Without
// this, every render in a file stays in document.body for the rest of the file, and a
// getByRole that should match one element starts finding several. Silent until two tests
// in one file render the same control.
afterEach(() => {
  cleanup();
  // AFTER cleanup: unmounting an editor saves its unsent text (useUnsentDraft) — it must not come
  // back in the next test that opens the same thread.
  clearAllUnsentDrafts();
  resetUnsentDraftPruneForTests();
});
// Shared answers (sharedFetch) must not leak from one test into the next.
afterEach(() => {
  invalidateSharedFetch();
  resetRoleDefaultsUnavailableForTests();
  // The Lookups tab's cache and its in-flight runs (#920): a run one test left unanswered must not
  // be joined by the next test's press.
  clearLookupCache();
});
// The last values views read (seededState) and the held thumbnails: a thread one test opened must
// not seed the next. Imported here, after the test, never at the top: both load the auth store
// (and the thumbnails the api client), and a static import would load them before a test file's
// vi.mock of those modules could apply.
afterEach(async () => {
  const [{ forgetSeeds }, { forgetThumbnails }] = await Promise.all([
    import('@/lib/seededState'),
    import('@/lib/attachmentThumbnails'),
  ]);
  forgetSeeds();
  forgetThumbnails();
});

// The app loads the rich-text editor lazily (LazyRichTextEditor: TipTap is not in the inbox
// bundle). Tests render it synchronously, as before — through whatever a test file mocks
// '@/components/shared/RichTextEditor' as. LazyRichTextEditor.test.tsx unmocks this to test the
// lazy path itself.
vi.mock('@/components/shared/LazyRichTextEditor', async () => {
  const editor = await import('@/components/shared/RichTextEditor');
  return { default: editor.default };
});
