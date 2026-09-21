/**
 * The shared components draw every chip, tab, button and title in the app, so the label face
 * (docs/UI_CONVENTIONS.md: Grotesk for labels) has to live in them — before this, none of
 * them set a face and every one of those rendered in body Sans.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Button } from '../Button';
import { Badge } from '../Badge';
import { CardTitle } from '../Card';
import { typographyVariants } from '../Typography/typography.styles';

afterEach(cleanup);

const classes = (el: HTMLElement) => el.className.split(/\s+/);

describe('shared components — label face', () => {
  it('sets buttons, badges and card titles in the label face', () => {
    render(
      <>
        <Button>Resolve</Button>
        <Badge>Spam</Badge>
        <CardTitle>Usage</CardTitle>
      </>
    );
    for (const text of ['Resolve', 'Spam', 'Usage']) {
      expect(
        classes(screen.getByText(text).closest('button, div, h3, span') as HTMLElement)
      ).toContain('font-display');
    }
  });

  it('lets a caller set an identifier in mono on a button', () => {
    render(<Button className="font-mono">a@b.co</Button>);
    const own = classes(screen.getByText('a@b.co').closest('button') as HTMLElement);
    expect(own).toContain('font-mono');
    expect(own).not.toContain('font-display');
  });

  it('sets every heading variant in the label face', () => {
    for (const variant of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label'] as const) {
      expect(typographyVariants({ variant }).split(/\s+/)).toContain('font-display');
    }
  });
});
