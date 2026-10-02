import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResolveDecisions } from '../ResolveDecisions';
import { MessageGhostBubble } from '../MessageGhostBubble';
import type { GhostOption } from '../messageDetailConstants';

const noop = () => undefined;

const renderDecisions = (variant?: 'inline' | 'phone') =>
  render(
    <ResolveDecisions
      mode="active"
      onResolve={noop}
      onResolveToKb={noop}
      onNotCustomerWork={noop}
      onResolveAsSpam={noop}
      {...(variant ? { variant } : {})}
    />
  );

const group = () => screen.getByRole('group', { name: 'Resolve decisions' });
const btn = (name: RegExp) => screen.getByRole('button', { name });
const rule = (root: HTMLElement) => root.querySelector('span.w-px[aria-hidden="true"]');

describe('ResolveDecisions layout per variant', () => {
  it('inline (default): row layout, rule between the Resolve pair and the quiet exits', () => {
    renderDecisions();
    const root = group();
    expect(root).toHaveAttribute('data-variant', 'inline');
    expect(root.className).toContain('flex-wrap');
    expect(root.className).not.toContain('flex-col');
    expect(rule(root)).not.toBeNull();
    expect(btn(/^Resolve$/).className).not.toContain('!h-[42px]');
    expect(btn(/save to KB/).className).toContain('h-[27px]');
    expect(btn(/save to KB/).className).toContain('border-border');
    expect(btn(/save to KB/).className).toContain('hover:text-pending');
    expect(btn(/save to KB/).className).not.toContain('!h-[42px]');
    expect(btn(/Not customer work/).className).toContain('h-[27px]');
    expect(btn(/Not customer work/).className).toContain('hover:bg-muted');
    expect(btn(/Not customer work/).className).not.toContain('!h-[38px]');
    expect(btn(/Resolve as spam/).className).toContain('h-[27px]');
    expect(btn(/Resolve as spam/).className).toContain('hover:!text-destructive');
  });

  it('phone: column band, no rule, 42px Resolve pair sharing the width, 38px quiet exits', () => {
    renderDecisions('phone');
    const root = group();
    expect(root).toHaveAttribute('data-variant', 'phone');
    expect(root.className).toContain('flex-col');
    expect(root.className).toContain('border-t');
    expect(root.className).toContain('bg-card');
    expect(rule(root)).toBeNull();
    expect(root.querySelectorAll('span[aria-hidden="true"].w-px')).toHaveLength(0);
    const pairRow = btn(/^Resolve$/).parentElement as HTMLElement;
    expect(pairRow.className).toContain('w-full');
    expect(pairRow.className).toContain('flex');
    expect(btn(/^Resolve$/).className).toContain('!h-[42px]');
    expect(btn(/save to KB/).className).toContain('!h-[42px]');
    expect(btn(/save to KB/).className).toContain('h-[27px]');
    expect(btn(/Not customer work/).className).toContain('!h-[38px]');
    expect(btn(/Not customer work/).className).toContain('h-[27px]');
    expect(btn(/Resolve as spam/).className).toContain('!h-[38px]');
    expect(btn(/Resolve as spam/).className).toContain('hover:!text-destructive');
  });
});

const option: GhostOption = {
  answer: '<p>Hello there</p>',
  label: 'Docs',
  type: 'documentation',
};

const ghost = (over: Partial<Parameters<typeof MessageGhostBubble>[0]> = {}) =>
  render(
    <MessageGhostBubble
      aiLoading={false}
      ghostVisible
      ghostOption={option}
      autoReply={undefined}
      composer=""
      composerMode="reply"
      resolved={false}
      alternativeCount={1}
      onGhostClick={vi.fn()}
      onShowAlternatives={vi.fn()}
      {...over}
    />
  );

const expectRow = (row: HTMLElement) => {
  expect(row.className).toContain('flex-row-reverse');
  expect(row.className).toContain('max-sm:block');
};
const expectAvatar = (avatar: HTMLElement) => {
  expect(avatar.className).toContain('max-sm:hidden');
  expect(avatar.className).toContain('w-[21px]');
  expect(avatar.className).toContain('border-dashed');
};

describe('MessageGhostBubble phone/desktop classes', () => {
  it('loading row + avatar', () => {
    const { container } = ghost({ aiLoading: true });
    const row = container.firstElementChild as HTMLElement;
    expectRow(row);
    expectAvatar(row.firstElementChild as HTMLElement);
    expect(screen.getByText('Generating suggestion…')).toBeInTheDocument();
  });

  it('no-suggestion row + avatar', () => {
    const { container } = ghost({ ghostOption: null });
    const row = container.firstElementChild as HTMLElement;
    expectRow(row);
    expectAvatar(row.firstElementChild as HTMLElement);
    expect(screen.getByText(/No suggestion found/)).toBeInTheDocument();
  });

  it('ghost row, avatar, column and dashed bubble', () => {
    ghost();
    const row = screen.getByRole('button', { name: /Tap to insert into reply/ });
    expectRow(row);
    expect(row.className).toContain('cursor-pointer');
    expect(row.className).toContain('focus-visible:outline-none');
    const [avatar, column] = Array.from(row.children) as HTMLElement[];
    expectAvatar(avatar);
    expect(column.className).toContain('max-w-[90%]');
    expect(column.className).toContain('max-sm:ml-7');
    const bubble = screen.getByText('Tap to insert into reply').parentElement as HTMLElement;
    expect(bubble.className).toContain('border-dashed');
    expect(bubble.className).toContain('border-ai-line');
    expect(bubble.className).toContain('max-sm:text-[14px]');
  });
});
