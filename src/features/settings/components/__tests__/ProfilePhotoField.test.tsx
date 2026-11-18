/**
 * Profile → photo: pick an image, frame it, save; or remove it. The checks a person can act on
 * happen before anything is sent (type, size); the server's refusals read as plain sentences.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { User } from '@/types';
import { userPhotoUrl } from '@/components/ui/UserPhoto';

const put = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>());
const del = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>());
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    put: (...args: unknown[]) => put(...args),
    delete: (...args: unknown[]) => del(...args),
  },
}));
// The canvas work needs a real browser; the field is tested around it.
vi.mock('../photoCrop', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  cropPhoto: vi.fn(() => Promise.resolve(new Blob(['jpeg'], { type: 'image/jpeg' }))),
}));
const setUser = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({ user: null as User | null }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (pick: (current: { user: User | null; setUser: typeof setUser }) => unknown) =>
    pick({ user: state.user, setUser }),
}));

const { ProfilePhotoField } = await import('../ProfilePhotoField');

const me = (photoKey: string | null): User =>
  ({ id: 5, email: 'ann@shop.example', firstName: 'Ann', lastName: 'Lee', photoKey }) as User;

const file = (name: string, type: string, bytes = 1024) =>
  new File([new Uint8Array(bytes)], name, { type });

const renderField = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ProfilePhotoField />
    </QueryClientProvider>
  );
};

const pick = (chosen: File) =>
  fireEvent.change(screen.getByLabelText('Choose a profile photo'), {
    target: { files: [chosen] },
  });

beforeEach(() => {
  state.user = me(null);
  put.mockResolvedValue({ data: { success: true, data: { photoKey: 'new-key' } } });
  del.mockResolvedValue({ status: 204 });
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ProfilePhotoField', () => {
  it('shows initials when there is no photo, the photo when there is', () => {
    renderField();
    expect(screen.getByText('AL')).toBeTruthy();
    cleanup();
    state.user = me('k-ann');
    renderField();
    expect(document.querySelector('img')?.getAttribute('src')).toBe(userPhotoUrl('k-ann'));
  });

  it('refuses a file over 10 MB before sending anything', () => {
    renderField();
    pick(file('big.png', 'image/png', 10 * 1024 * 1024 + 1));
    expect(screen.getByText('Photo must be 10 MB or smaller')).toBeTruthy();
    expect(put).not.toHaveBeenCalled();
  });

  it('refuses a GIF before sending anything', () => {
    renderField();
    pick(file('a.gif', 'image/gif'));
    expect(screen.getByText('Use a PNG, JPEG or WebP image')).toBeTruthy();
    expect(put).not.toHaveBeenCalled();
  });

  it('frames, then saves: PUT /api/users/me/photo with the cropped image as `photo`', async () => {
    renderField();
    pick(file('me.png', 'image/png'));
    expect(await screen.findByText('Frame your photo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save photo' }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    const [url, body] = put.mock.calls[0] as [string, FormData];
    expect(url).toBe('/api/users/me/photo');
    expect(body.get('photo')).toBeInstanceOf(Blob);
    await waitFor(() =>
      expect(setUser).toHaveBeenCalledWith(expect.objectContaining({ photoKey: 'new-key' }))
    );
  });

  it('says plainly when the server cannot read the image', async () => {
    put.mockRejectedValue({
      status: 400,
      data: { code: 'PHOTO_UNREADABLE', error: 'We couldn’t read that image' },
    });
    renderField();
    pick(file('me.png', 'image/png'));
    fireEvent.click(await screen.findByRole('button', { name: 'Save photo' }));
    expect(await screen.findByText('We couldn’t read that image. Try another photo.')).toBeTruthy();
  });

  it('removes the photo: DELETE, then initials again', async () => {
    state.user = me('k-ann');
    renderField();
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('/api/users/me/photo'));
    await waitFor(() =>
      expect(setUser).toHaveBeenCalledWith(expect.objectContaining({ photoKey: null }))
    );
  });

  it('no Remove button without a photo', () => {
    renderField();
    expect(screen.queryByRole('button', { name: 'Remove photo' })).toBeNull();
  });
});
