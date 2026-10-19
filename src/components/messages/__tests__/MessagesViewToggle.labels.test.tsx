import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MessagesViewToggle } from '../MessagesViewToggle';

// The page is "Threads" (#632); its view switcher must not say Threads again.
describe('MessagesViewToggle — labels', () => {
  it('reads List / Contacts / Kanban', () => {
    render(
      <MemoryRouter>
        <MessagesViewToggle displayMode="threads" onModeChange={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByText('List')).toBeInTheDocument();
    expect(screen.getByText('Contacts')).toBeInTheDocument();
    expect(screen.getByText('Kanban')).toBeInTheDocument();
    expect(screen.queryByText('Threads')).toBeNull();
  });
});
