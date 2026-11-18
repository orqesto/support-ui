/**
 * A teammate's profile photo inside whatever avatar circle the screen already draws. No key, or
 * an image that does not load (removed since the list was fetched, a teammate who left), shows
 * the screen's own initials — never a broken-image icon or an empty circle.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { API_BASE_URL } from '@/lib/config';
import { UserPhoto, userPhotoUrl } from '@/components/ui/UserPhoto';

afterEach(() => vi.useRealTimers());

describe('UserPhoto', () => {
  it('without a key shows the initials it wraps', () => {
    render(
      <UserPhoto photoKey={null}>
        <span>AL</span>
      </UserPhoto>
    );
    expect(screen.getByText('AL')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('with a key: initials stay until the photo has loaded, then the photo replaces them', () => {
    render(
      <UserPhoto photoKey="Abc_-123">
        <span>AL</span>
      </UserPhoto>
    );
    const img = document.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe(`${API_BASE_URL}/api/user-photos/Abc_-123`);
    expect(screen.getByText('AL')).toBeInTheDocument();
    // Not shown while loading: `block` would win over the hidden attribute (review 8b, F2).
    expect(img.className).toMatch(/\bhidden\b/);
    expect(img.className).not.toMatch(/\bblock\b/);
    fireEvent.load(img);
    expect(screen.queryByText('AL')).toBeNull();
    expect(img.className).toMatch(/\bblock\b/);
    expect(img.className).not.toMatch(/\bhidden\b/);
  });

  it('fills the circle it sits in', () => {
    render(<UserPhoto photoKey="k1">AL</UserPhoto>);
    const img = document.querySelector('img');
    fireEvent.load(img as HTMLImageElement);
    expect(img?.className).toMatch(/w-full/);
    expect(img?.className).toMatch(/h-full/);
    expect(img?.className).toMatch(/rounded-full/);
    expect(img?.className).toMatch(/object-cover/);
  });

  it('a failed load is tried once more later (a passing 401/429), then stays on initials', () => {
    vi.useFakeTimers();
    render(<UserPhoto photoKey="flaky">AL</UserPhoto>);
    fireEvent.error(document.querySelector('img') as HTMLImageElement);
    expect(document.querySelector('img')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    const retry = document.querySelector('img') as HTMLImageElement;
    expect(retry).not.toBeNull();
    fireEvent.error(retry);
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  it('a key change drops the old key’s retry: it cannot clear the new key’s failure (F3)', () => {
    vi.useFakeTimers();
    const { rerender } = render(<UserPhoto photoKey="old">AL</UserPhoto>);
    fireEvent.error(document.querySelector('img') as HTMLImageElement);
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    rerender(<UserPhoto photoKey="new">AL</UserPhoto>);
    fireEvent.error(document.querySelector('img') as HTMLImageElement);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    // 30 s after the OLD failure: the old timer must not bring the new photo back early.
    expect(document.querySelector('img')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(document.querySelector('img')?.getAttribute('src')).toBe(userPhotoUrl('new'));
  });

  it('falls back to the initials when the image fails to load', () => {
    render(
      <UserPhoto photoKey="gone">
        <span>AL</span>
      </UserPhoto>
    );
    fireEvent.error(document.querySelector('img') as HTMLImageElement);
    expect(screen.getByText('AL')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('tries again when a NEW key arrives after a failure', () => {
    const { rerender } = render(<UserPhoto photoKey="old">AL</UserPhoto>);
    fireEvent.error(document.querySelector('img') as HTMLImageElement);
    rerender(<UserPhoto photoKey="new">AL</UserPhoto>);
    expect(document.querySelector('img')?.getAttribute('src')).toBe(userPhotoUrl('new'));
  });
});
