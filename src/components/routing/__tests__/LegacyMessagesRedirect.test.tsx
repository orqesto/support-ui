import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ROUTER_FUTURE } from '@/test/routerFuture';
import { LegacyMessagesRedirect, threadsPathFor } from '../LegacyMessagesRedirect';

const Where = () => {
  const location = useLocation();
  return (
    <div data-testid="where">
      {location.pathname}
      {location.search}
      {location.hash}
    </div>
  );
};

// Same route shape as App.tsx: the redirect catches /messages and everything below it.
const mount = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]} future={ROUTER_FUTURE}>
      <Routes>
        <Route path="/messages/*" element={<LegacyMessagesRedirect />} />
        <Route path="/threads" element={<Where />} />
        <Route path="/threads/:id" element={<Where />} />
        <Route path="*" element={<div data-testid="where">not found</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('LegacyMessagesRedirect (/messages → /threads)', () => {
  it.each([
    ['/messages', '/threads'],
    ['/messages/42', '/threads/42'],
    ['/messages/42?tab=ai#reply', '/threads/42?tab=ai#reply'],
    ['/messages?id=ADM-SUP-7&kind=event', '/threads?id=ADM-SUP-7&kind=event'],
    ['/messages?queue=suspicious#top', '/threads?queue=suspicious#top'],
  ])('%s lands on %s', (from, to) => {
    mount(from);
    expect(screen.getByTestId('where').textContent).toBe(to);
  });

  it('rewrites only the leading /messages segment', () => {
    expect(threadsPathFor('/messages')).toBe('/threads');
    expect(threadsPathFor('/messages/7')).toBe('/threads/7');
    expect(threadsPathFor('/messages-archive')).toBe('/messages-archive');
    expect(threadsPathFor('/tickets/messages')).toBe('/tickets/messages');
  });
});
