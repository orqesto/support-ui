import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataTable } from '../DataTable';
import type { ColumnDef } from '../dataTable.types';

type Row = { id: number; name: string; email: string };

const rows: Row[] = [
  { id: 1, name: 'Alice', email: 'alice@x.com' },
  { id: 2, name: 'Bob', email: 'bob@x.com' },
  { id: 3, name: 'Carol', email: 'carol@x.com' },
  { id: 4, name: 'Dave', email: 'dave@x.com' },
  { id: 5, name: 'Eve', email: 'eve@x.com' },
];

const columns: ColumnDef<Row>[] = [
  { id: 'name', header: 'Name', cell: (row) => row.name },
  { id: 'email', header: 'Email', cell: (row) => row.email },
];

afterEach(cleanup);

describe('DataTable', () => {
  it('client mode slices to pageSize (the table owns the slice)', () => {
    render(
      <DataTable
        rows={rows}
        rowKey={(row) => row.id}
        columns={columns}
        pagination={{ mode: 'client', pageSize: 2 }}
      />
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    // rows 3+ are on later pages, not rendered
    expect(screen.queryByText('Carol')).not.toBeInTheDocument();
  });

  it('server mode renders ALL provided rows (caller already paginated — must not re-slice)', () => {
    render(
      <DataTable
        rows={rows}
        rowKey={(row) => row.id}
        columns={columns}
        pagination={{
          mode: 'server',
          page: 1,
          totalPages: 3,
          total: 5,
          limit: 2,
          onPageChange: vi.fn(),
        }}
      />
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Eve')).toBeInTheDocument(); // 5th row still shown, not clipped to limit 2
  });

  it('client search filters rows via clientAccessor', () => {
    render(
      <DataTable
        rows={rows}
        rowKey={(row) => row.id}
        columns={columns}
        search={{ value: 'bob', onChange: () => {}, clientAccessor: (row) => [row.name, row.email] }}
        pagination={{ mode: 'client', pageSize: 10 }}
      />
    );
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
  });

  it('shows the empty message when there are no rows and no active search', () => {
    render(
      <DataTable
        rows={[]}
        rowKey={(row: Row) => row.id}
        columns={columns}
        pagination={{ mode: 'client', pageSize: 10 }}
        empty={{ message: 'No users yet.' }}
      />
    );
    expect(screen.getByText('No users yet.')).toBeInTheDocument();
  });

  it('shows the filtered-empty message when a search yields nothing', () => {
    render(
      <DataTable
        rows={rows}
        rowKey={(row) => row.id}
        columns={columns}
        search={{ value: 'zzz', onChange: () => {}, clientAccessor: (row) => [row.name] }}
        pagination={{ mode: 'client', pageSize: 10 }}
        empty={{ message: 'No users yet.', filteredMessage: 'No matches.' }}
      />
    );
    expect(screen.getByText('No matches.')).toBeInTheDocument();
    expect(screen.queryByText('No users yet.')).not.toBeInTheDocument();
  });

  it('renders an error state with a working Retry', () => {
    const onRetry = vi.fn();
    render(
      <DataTable
        rows={[]}
        rowKey={(row: Row) => row.id}
        columns={columns}
        pagination={{ mode: 'client', pageSize: 10 }}
        isError
        onRetry={onRetry}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('renders a trailing actions cell per row', () => {
    render(
      <DataTable
        rows={rows.slice(0, 1)}
        rowKey={(row) => row.id}
        columns={columns}
        actions={(row) => <button>act-{row.id}</button>}
        pagination={{ mode: 'client', pageSize: 10 }}
      />
    );
    expect(screen.getByText('act-1')).toBeInTheDocument();
  });

  it('renderEditRow replaces a row with a full-width edit cell (inline edit)', () => {
    render(
      <DataTable
        rows={rows.slice(0, 2)}
        rowKey={(row) => row.id}
        columns={columns}
        pagination={{ mode: 'client', pageSize: 10 }}
        renderEditRow={(row) => (row.id === 2 ? <span>editing-{row.id}</span> : null)}
      />
    );
    // Editing row shows the edit node instead of its normal cells…
    expect(screen.getByText('editing-2')).toBeInTheDocument();
    expect(screen.queryByText('bob@x.com')).not.toBeInTheDocument();
    // …while other rows render normally.
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('alice@x.com')).toBeInTheDocument();
  });

  it('resetPageKey snaps the client page back to 1 when an external filter changes', () => {
    const { rerender } = render(
      <DataTable
        rows={rows}
        rowKey={(row) => row.id}
        columns={columns}
        pagination={{ mode: 'client', pageSize: 2 }}
        resetPageKey="all"
      />
    );
    // Go to page 2 (Carol, Dave).
    fireEvent.click(screen.getAllByRole('button', { name: /next/i })[0]);
    expect(screen.getByText('Carol')).toBeInTheDocument();
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();

    // Changing the external filter key resets to page 1.
    rerender(
      <DataTable
        rows={rows}
        rowKey={(row) => row.id}
        columns={columns}
        pagination={{ mode: 'client', pageSize: 2 }}
        resetPageKey="active"
      />
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.queryByText('Carol')).not.toBeInTheDocument();
  });

  it('fires search.onBlur when the search box blurs', () => {
    const onBlur = vi.fn();
    render(
      <DataTable
        rows={rows}
        rowKey={(row) => row.id}
        columns={columns}
        pagination={{ mode: 'client', pageSize: 10 }}
        search={{ value: '', onChange: () => {}, onBlur, placeholder: 'Search' }}
      />
    );
    fireEvent.blur(screen.getByRole('textbox'));
    expect(onBlur).toHaveBeenCalledOnce();
  });
});
