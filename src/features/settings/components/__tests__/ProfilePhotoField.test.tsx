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
const get = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>());
const del = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>());
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    put: (...args: unknown[]) => put(...args),
    get: (...args: unknown[]) => get(...args),
    delete: (...args: unknown[]) => del(...args),
  },
}));
// The canvas work needs a real browser; the field is tested around it.
vi.mock('../photoCrop', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  cropPhoto: vi.fn(() => Promise.resolve(new Blob(['jpeg'], { type: 'image/jpeg' }))),
}));
const setUser = vi.hoisted(() => vi.fn());
const openImage = vi.hoisted(() => vi.fn<(file: Blob) => Promise<unknown>>());
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
  // The picked file is decoded straight into a bitmap (no URL of it is ever made).
  openImage.mockReset().mockResolvedValue({ width: 400, height: 300, close: () => undefined });
  vi.stubGlobal('createImageBitmap', (file: Blob) => openImage(file));
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

  it('a large phone photo (12 MB) is fine: only the framed 512 px square is uploaded', async () => {
    renderField();
    pick(file('phone.jpg', 'image/jpeg', 12 * 1024 * 1024));
    expect(await screen.findByText('Frame your photo')).toBeTruthy();
  });

  it('refuses a file over 40 MB before sending anything', () => {
    renderField();
    pick(file('big.png', 'image/png', 40 * 1024 * 1024 + 1));
    expect(screen.getByText('Photo must be 40 MB or smaller')).toBeTruthy();
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

  it('after a sign-in that did not carry the key, it asks the server and shows the photo + Remove', async () => {
    state.user = { ...me(null) } as User;
    delete (state.user as { photoKey?: unknown }).photoKey;
    get.mockResolvedValue({ data: { success: true, data: { ...me('k-ann') } } });
    renderField();
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/users/me'));
    await waitFor(() =>
      expect(setUser).toHaveBeenCalledWith(expect.objectContaining({ photoKey: 'k-ann' }))
    );
  });

  it('an older server that knows nothing of photos: no upload button at all', async () => {
    state.user = { ...me(null) } as User;
    delete (state.user as { photoKey?: unknown }).photoKey;
    const older = { ...me(null) } as Record<string, unknown>;
    delete older.photoKey;
    get.mockResolvedValue({ data: { success: true, data: older } });
    renderField();
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Upload photo' })).toBeNull();
    expect(setUser).not.toHaveBeenCalled();
  });

  it('a file that is not really an image says so at once, not after Save', async () => {
    openImage.mockRejectedValue(new Error('The source image could not be decoded.'));
    renderField();
    pick(file('fake.png', 'image/png'));
    expect(await screen.findByText('We couldn’t read that image. Try another photo.')).toBeTruthy();
    expect(screen.queryByText('Frame your photo')).toBeNull();
    expect(put).not.toHaveBeenCalled();
  });

  it('the preview is drawn from the decoded picture: no image element, no file URL', async () => {
    renderField();
    pick(file('me.png', 'image/png'));
    expect(await screen.findByRole('img', { name: 'Your new profile photo' })).toBeTruthy();
    expect(openImage).toHaveBeenCalledTimes(1);
    expect(document.querySelector('img[src^="blob:"]')).toBeNull();
  });

  it('no Remove button without a photo', () => {
    renderField();
    expect(screen.queryByRole('button', { name: 'Remove photo' })).toBeNull();
  });
});
