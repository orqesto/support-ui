/**
 * A teammate's profile photo inside whatever avatar circle the screen already draws. No key, or
 * an image that does not load (removed since the list was fetched, a teammate who left), shows
 * the screen's own initials — never a broken-image icon or an empty circle.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { API_BASE_URL } from '@/lib/config';
import { UserPhoto, userPhotoUrl } from '@/components/ui/UserPhoto';

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

  it('with a key shows the photo from the API, in place of the initials', () => {
    render(
      <UserPhoto photoKey="Abc_-123">
        <span>AL</span>
      </UserPhoto>
    );
    const img = document.querySelector('img');
    expect(img?.getAttribute('src')).toBe(`${API_BASE_URL}/api/user-photos/Abc_-123`);
    expect(screen.queryByText('AL')).toBeNull();
  });

  it('fills the circle it sits in', () => {
    render(<UserPhoto photoKey="k1">AL</UserPhoto>);
    const img = document.querySelector('img');
    expect(img?.className).toMatch(/w-full/);
    expect(img?.className).toMatch(/h-full/);
    expect(img?.className).toMatch(/rounded-full/);
    expect(img?.className).toMatch(/object-cover/);
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
