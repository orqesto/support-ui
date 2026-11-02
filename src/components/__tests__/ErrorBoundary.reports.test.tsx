/**
 * The crash screen said "The error has been logged" while the error only reached the browser
 * console. A crash is now sent to the server log while signed in, and the screen only claims it
 * was reported when it was.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const posts: { url: string; body: Record<string, unknown> }[] = [];
let postFails = false;
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    post: (url: string, body: Record<string, unknown>) => {
      posts.push({ url, body });
      return postFails ? Promise.reject(new Error('404')) : Promise.resolve({ data: {} });
    },
  },
}));

const { ErrorBoundary } = await import('../ErrorBoundary');
const { useAuthStore } = await import('@/stores/authStore');

const Boom = ({ message }: { message: string }) => {
  throw new Error(message);
};

const signIn = () =>
  useAuthStore.setState({
    isAuthenticated: true,
    user: { id: 1, email: 'agent@example.com', role: 'user' } as never,
  });

afterEach(() => {
  cleanup();
  posts.length = 0;
  postFails = false;
  useAuthStore.setState({ isAuthenticated: false, user: null });
  window.history.replaceState(null, '', '/');
});

const crash = (message: string) => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  render(
    <ErrorBoundary>
      <Boom message={message} />
    </ErrorBoundary>
  );
};

describe('ErrorBoundary — crash reports', () => {
  it('signed in: sends the crash once, path only, and says it was reported', async () => {
    signIn();
    window.history.replaceState(null, '', '/tickets?id=101&q=someone@example.com');
    crash("null is not an object (evaluating 'e.cached')");
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe('/api/client-errors');
    expect(posts[0].body).toMatchObject({
      message: "null is not an object (evaluating 'e.cached')",
      path: '/tickets',
    });
    expect(posts[0].body.componentStack).toEqual(expect.stringContaining('Boom'));
    expect(await screen.findByText(/The error has been reported\./)).toBeTruthy();
  });

  it('clips oversized fields to what the server accepts', () => {
    signIn();
    crash('x'.repeat(2000));
    expect((posts[0].body.message as string).length).toBe(500);
  });

  it('signed out: sends nothing (a 401 would bounce to /login) and claims nothing', () => {
    crash('boom');
    expect(posts).toHaveLength(0);
    expect(screen.queryByText(/reported|logged/)).toBeNull();
    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });

  it('a failed report (older server: 404) does not break the crash screen', async () => {
    signIn();
    postFails = true;
    crash('boom');
    await Promise.resolve();
    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });
});
