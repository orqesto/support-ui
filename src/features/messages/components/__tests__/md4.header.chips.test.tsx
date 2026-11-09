/**
 * Message detail v4 — the header: sentence-case chips and the status menu (H1), tinted label pills
 * (H6). Shared mocks and render helpers: md4.header.utils.tsx.
 */
import { describe, it, expect, vi } from 'vitest';
import { message, renderHeader, uppercased } from './md4.header.utils';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Message } from '@/types';
import type { Label } from '@/services/settings.service';
import { HeaderMetaStrip } from '../HeaderMetaStrip';
import { ThemeProvider } from '@/contexts/ThemeContext';

// In each test file, not the shared utils: the apiClient path scanner
// (servicePathsCarryApiPrefix.test.ts) reads every module that is not itself a test.
vi.mock('@/lib/api-client', () => ({
  apiClient: new Proxy(
    {},
    { get: () => () => Promise.resolve({ data: { success: true, data: [] } }) }
  ),
}));

describe('H1 — header chips read in sentence case', () => {
  it('status, priority and SLA chips carry no uppercase label', async () => {
    renderHeader();
    const status = await screen.findByText('In progress');
    const priority = screen.getByText('High');
    expect(uppercased(status)).toBe(false);
    expect(uppercased(priority)).toBe(false);
    expect(uppercased(screen.getByTestId('sla-clock'))).toBe(false);
    // 12px / 500, as v4's `.arow .chip .lab`.
    expect(screen.getByTestId('sla-clock').className).toContain('text-[12px]');
    expect(screen.getByTestId('sla-clock').className).toContain('font-medium');
  });
});

describe('H1 — the overlay chips read in sentence case beside the status chip', () => {
  it.each([
    ['Spam', { status: 'filtered' }],
    ['Suspicious', { metadata: { analysis: {}, spamCheck: { category: 'suspicious' } } }],
    ['Reanalysing', { metadata: { analysis: {}, aiReanalysisInFlight: true } }],
    ['Not analysed', { lastReplyFromClient: undefined, metadata: {} }],
    ['Lead', { isLead: true }],
  ] as const)('%s', async (word, over) => {
    renderHeader({ message: { ...message, ...over } as unknown as Message });
    const chips = await screen.findByTestId('header-chips');
    const chip = within(chips).getByText(word);
    expect(uppercased(chip)).toBe(false);
    expect(chip.className).toContain('normal-case');
    expect(chips.textContent).not.toMatch(/SPAM|SUSPICIOUS|REANALY|NOT ANALYSED|LEAD/);
    // One spelling for the action: the More menu says "Reanalyse" / "Reanalysing…".
    expect(chips.textContent).not.toMatch(/Re-analy/i);
  });
});

describe('H1 — the top row names the channel by its name (v4 "✉ Email · 6 msgs")', () => {
  it.each([
    ['email', '✉ Email'],
    ['whatsapp', '✆ WhatsApp'],
    ['sms_gateway', '◌ Sms gateway'],
  ])('%s → %s', async (channel, words) => {
    renderHeader({ message: { ...message, channel } as unknown as Message, threadCount: 6 });
    const line = await screen.findByText(new RegExp(`^${words}`));
    expect(line.textContent).toBe(`${words} · 6 msgs`);
    expect(line.getAttribute('title')).toBe(words.slice(2));
  });
});

describe('H1 — the status menu reads in sentence case, like its chip', () => {
  it('the current row says "In progress" (not "In Progress"); the others "On-hold", "Resolved"', async () => {
    renderHeader();
    const chip = await screen.findByText('In progress');
    const combobox = screen
      .getAllByRole('combobox')
      .find((box) => box.closest('[class*="container"]')?.contains(chip));
    expect(combobox).toBeTruthy();
    fireEvent.keyDown(combobox as HTMLElement, { key: 'ArrowDown' });
    const rows = (await screen.findAllByRole('option')).map((option) => option.textContent);
    expect(rows).toEqual(['In progress', 'On-hold', 'Resolved']);
  });
});

describe('H6 — label pills are tinted with a colour dot', () => {
  it('a label reads as a tint of its colour, not a solid fill', () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <QueryClientProvider client={new QueryClient()}>
            <HeaderMetaStrip
              message={message}
              categories={[]}
              messageLabels={[{ id: 3, name: 'VIP', color: '#6D28D9' } as Label]}
              allLabels={[{ id: 3, name: 'VIP', color: '#6D28D9' } as Label]}
              hasManageLabels
              showLabelPicker={false}
              updatingCategory={false}
              onSetCategory={vi.fn()}
              onToggleLabel={vi.fn()}
              onToggleLabelPicker={vi.fn()}
              onCloseLabelPicker={vi.fn()}
            />
          </QueryClientProvider>
        </MemoryRouter>
      </ThemeProvider>
    );
    const pill = screen.getByTestId('label-pill');
    expect(pill).toHaveTextContent('VIP');
    expect(pill.style.backgroundColor).toBe('');
    expect(pill.className).toContain('user-color-chip');
    const dot = pill.querySelector<HTMLElement>('span[aria-hidden]');
    expect(dot?.style.background).not.toBe('');
  });
});
