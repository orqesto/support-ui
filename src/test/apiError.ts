/**
 * Builds the error a call site ACTUALLY catches, by pushing a realistic axios
 * failure through the real api-client interceptor.
 *
 * Use this in every test that rejects an API call. Hand-written `{ response: {
 * status } }` fixtures are the trap this exists to close: the interceptor does not
 * rethrow the axios error — when the BE sends a body it builds a fresh `Error` with
 * `status`/`data` and no `.response`. `ComposerAiActions.test.tsx` asserted its 429
 * and 403 branches against the axios shape and passed for months while both
 * branches were dead in production, because the fixture, not the app, decided the
 * shape. A test that constructs its own error can only ever prove itself.
 *
 * ⚠ Driving the real handler means the real side effects fire: a 401 calls
 * `logout()` and assigns `window.location.href`, and a 402 arms the subscription
 * gate store. That is faithful, but reset those stores if a test asserts on them.
 */
import { vi } from 'vitest';
import type * as ApiClientModule from '@/lib/api-client';

/**
 * Resolved through `importActual` on purpose: most service tests mock
 * `@/lib/api-client` wholesale, and a mocked handler would hand back whatever the
 * test invented — reintroducing the exact problem this helper exists to prevent.
 */
const realHandler = async (): Promise<(error: unknown) => Promise<never>> => {
  const actual = await vi.importActual<typeof ApiClientModule>('@/lib/api-client');
  return actual.handleResponseError;
};

/** The rejection a caller sees for a BE failure carrying a JSON body. */
export const apiError = async (status: number, body: unknown = {}): Promise<unknown> => {
  const axiosError = Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: body },
  });
  return (await realHandler())(axiosError).catch((err: unknown) => err);
};

/** The rejection a caller sees when there is no response at all (network drop). */
export const networkError = async (): Promise<unknown> => {
  const axiosError = Object.assign(new Error('Network Error'), { isAxiosError: true });
  return (await realHandler())(axiosError).catch((err: unknown) => err);
};
