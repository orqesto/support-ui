/**
 * Platform Defaults → Knowledge base: `kb.capture_ai_question` (2026-10-07). The switch sends
 * PATCH /api/admin/platform/settings/kb with the new value; a backend without the setting gets
 * no switch, only the words that it arrives with the next backend release.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const patches: { url: string; body: unknown }[] = [];
let patch: () => Promise<unknown>;
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    patch: (url: string, body: unknown) => {
      patches.push({ url, body });
      return patch();
    },
    get: () => new Promise(() => undefined),
  },
}));
vi.mock('@/lib/toast', () => ({ toast: { failure: () => undefined, success: () => undefined } }));

const { KbCaptureCard, KB_CAPTURE_AI_LABEL, KB_CAPTURE_AI_DESCRIPTION, KB_CAPTURE_NOT_DEPLOYED } =
  await import('../KbCaptureCard');
const { normalizeKb } = await import('@/services/platformSettings.service');

const wrap = (node: ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>
  );

beforeEach(() => {
  patches.length = 0;
  patch = () => Promise.resolve({ data: { success: true } });
});
afterEach(cleanup);

describe('KbCaptureCard', () => {
  it('turning the setting off sends PATCH /settings/kb with captureAiQuestion: false', async () => {
    wrap(<KbCaptureCard kb={{ captureAiQuestion: { value: true, source: 'default' } }} />);
    expect(screen.getByText(KB_CAPTURE_AI_LABEL)).toBeInTheDocument();
    expect(screen.getByText(KB_CAPTURE_AI_DESCRIPTION)).toBeInTheDocument();
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({
      url: '/api/admin/platform/settings/kb',
      body: { captureAiQuestion: false },
    });
  });

  it('turning it on sends captureAiQuestion: true', async () => {
    wrap(<KbCaptureCard kb={{ captureAiQuestion: { value: false, source: 'db' } }} />);
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ captureAiQuestion: true });
  });

  it('an older backend without the setting: no switch, says it arrives with the next release', () => {
    wrap(<KbCaptureCard kb={undefined} />);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByText(KB_CAPTURE_NOT_DEPLOYED)).toBeInTheDocument();
  });
});

describe('normalizeKb', () => {
  it('keeps only a boolean value and treats any other shape as absent', () => {
    expect(normalizeKb({ captureAiQuestion: { value: false, source: 'db' } })).toEqual({
      captureAiQuestion: { value: false, source: 'db' },
    });
    expect(normalizeKb({ captureAiQuestion: { value: 'false', source: 'db' } })).toBeUndefined();
    expect(normalizeKb(undefined)).toBeUndefined();
    expect(
      normalizeKb({ captureAiQuestion: { value: true, source: 'x' } })?.captureAiQuestion.source
    ).toBe('default');
  });
});
