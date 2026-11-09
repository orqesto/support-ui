import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Message } from '@/types';
import { HeaderTopRow } from '../messageDetailHeader/HeaderTopRow';

const props = (isPhone: boolean, presence?: React.ReactNode) => ({
  message: { id: 1, channel: 'email', subject: 'Hi' } as Message,
  orgCode: undefined,
  threadCount: 1,
  compact: false,
  isPhone,
  isFullPage: false,
  showFullPageButton: false,
  onClose: vi.fn(),
  showLabelPicker: false,
  setShowLabelPicker: vi.fn(),
  linkCopied: false,
  handleCopyLink: vi.fn(),
  moreButtonRef: { current: null },
  moreOpen: false,
  setMoreOpen: vi.fn(),
  moreSheet: null,
  presence,
});

const eye = <span data-testid="eye" />;
const order = (first: HTMLElement, second: HTMLElement) =>
  first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING;

describe('HeaderTopRow presence slot', () => {
  it('desktop: the eye sits before the copy-link icon', () => {
    render(
      <MemoryRouter>
        <HeaderTopRow {...props(false, eye)} />
      </MemoryRouter>
    );
    expect(order(screen.getByTestId('eye'), screen.getByLabelText('Copy link'))).toBeTruthy();
  });

  it('phone: the eye sits next to More, before it', () => {
    render(
      <MemoryRouter>
        <HeaderTopRow {...props(true, eye)} />
      </MemoryRouter>
    );
    expect(order(screen.getByTestId('eye'), screen.getByLabelText('More actions'))).toBeTruthy();
  });

  it('renders no slot without a presence prop', () => {
    render(
      <MemoryRouter>
        <HeaderTopRow {...props(false)} />
      </MemoryRouter>
    );
    expect(screen.queryByTestId('eye')).toBeNull();
  });
});
