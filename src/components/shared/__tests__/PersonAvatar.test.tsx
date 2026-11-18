/** The users list and the sidebar draw a person's circle; with a photo key it shows the photo. */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userPhotoUrl } from '@/components/ui/UserPhoto';
import { PersonAvatar } from '@/components/shared/PersonAvatar';

afterEach(cleanup);

describe('PersonAvatar', () => {
  it('shows the photo when the person has one', () => {
    render(
      <PersonAvatar photoKey="k-ann" className="w-10 h-10">
        AL
      </PersonAvatar>
    );
    expect(document.querySelector('img')?.getAttribute('src')).toBe(userPhotoUrl('k-ann'));
  });

  it('control: the initials it was given without a key, in a clipped circle', () => {
    const { container } = render(
      <PersonAvatar photoKey={null} className="w-10 h-10">
        AL
      </PersonAvatar>
    );
    expect(screen.getByText('AL')).toBeTruthy();
    expect((container.firstChild as HTMLElement).className).toMatch(/rounded-full/);
    expect((container.firstChild as HTMLElement).className).toMatch(/overflow-hidden/);
    expect((container.firstChild as HTMLElement).className).toMatch(/w-10 h-10/);
  });
});
