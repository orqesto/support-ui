import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
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
        search={{
          value: 'bob',
          onChange: () => {},
          clientAccessor: (row) => [row.name, row.email],
        }}
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

  it('the hidden actions header is anchored inside the table box, not the page (2026-10-18)', () => {
    // An sr-only label is `position: absolute`; with no positioned ancestor it anchored to the page
    // and, on a long scrolled console page, made the document taller than the window (a second
    // page scrollbar, the whole layout sliding up). jsdom has no layout, so pin the anchor itself.
    render(
      <DataTable
        rows={rows.slice(0, 1)}
        rowKey={(row) => row.id}
        columns={columns}
        actions={(row) => <button>act-{row.id}</button>}
        actionsLabel="Details"
        pagination={{ mode: 'client', pageSize: 10 }}
      />
    );
    const label = screen.getByText('Details');
    expect(label).toHaveClass('sr-only');
    const anchor = label.closest('table')!.parentElement!;
    expect(anchor).toHaveClass('relative');
    expect(anchor).toHaveClass('overflow-auto');
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

  it('renderCard renders a mobile card per visible row (alongside the desktop table)', () => {
    render(
      <DataTable
        rows={rows}
        rowKey={(row) => row.id}
        columns={columns}
        pagination={{ mode: 'client', pageSize: 2 }}
        renderCard={(row) => <span>card-{row.name}</span>}
      />
    );
    // One card per row on the current page (pageSize 2 → Alice, Bob).
    expect(screen.getByText('card-Alice')).toBeInTheDocument();
    expect(screen.getByText('card-Bob')).toBeInTheDocument();
    // Rows on later pages aren't rendered as cards.
    expect(screen.queryByText('card-Carol')).not.toBeInTheDocument();
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

describe('DataTable sorting (opt-in per column)', () => {
  type Scored = { id: number; name: string; score: number | null };
  const scored: Scored[] = [
    { id: 1, name: 'Bravo', score: 20 },
    { id: 2, name: 'Alpha', score: null },
    { id: 3, name: 'Charlie', score: 5 },
  ];
  const sortColumns: ColumnDef<Scored>[] = [
    { id: 'name', header: 'Name', cell: (row) => row.name },
    {
      id: 'score',
      header: 'Score',
      cell: (row) => row.score ?? '—',
      sortValue: (row) => row.score,
    },
  ];
  const renderSorted = () =>
    render(
      <DataTable
        rows={scored}
        rowKey={(row) => row.id}
        columns={sortColumns}
        pagination={{ mode: 'client', pageSize: 10 }}
      />
    );
  const order = () =>
    screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.querySelector('td')?.textContent);

  it('sorts ascending, then descending, then back to the original order (empty values last)', () => {
    renderSorted();
    expect(order()).toEqual(['Bravo', 'Alpha', 'Charlie']);
    const button = screen.getByRole('button', { name: /Score/ });
    fireEvent.click(button);
    expect(order()).toEqual(['Charlie', 'Bravo', 'Alpha']);
    fireEvent.click(button);
    expect(order()).toEqual(['Bravo', 'Charlie', 'Alpha']);
    fireEvent.click(button);
    expect(order()).toEqual(['Bravo', 'Alpha', 'Charlie']);
  });

  it('aria-sort on the header follows the state', () => {
    renderSorted();
    const header = screen.getByRole('columnheader', { name: /Score/ });
    expect(header).toHaveAttribute('aria-sort', 'none');
    const button = screen.getByRole('button', { name: /Score/ });
    fireEvent.click(button);
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    fireEvent.click(button);
    expect(header).toHaveAttribute('aria-sort', 'descending');
    fireEvent.click(button);
    expect(header).toHaveAttribute('aria-sort', 'none');
  });

  it('a column without sortValue has no sort button and no aria-sort', () => {
    renderSorted();
    expect(screen.queryByRole('button', { name: /Name/ })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Name' })).not.toHaveAttribute('aria-sort');
  });

  it('a table with no sortable column renders plain headers (existing users unchanged)', () => {
    render(
      <DataTable
        rows={rows}
        rowKey={(row) => row.id}
        columns={columns}
        pagination={{ mode: 'client', pageSize: 10 }}
      />
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('client mode sorts the whole list before slicing a page', () => {
    render(
      <DataTable
        rows={scored}
        rowKey={(row) => row.id}
        columns={sortColumns}
        pagination={{ mode: 'client', pageSize: 1 }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Score/ }));
    expect(order()).toEqual(['Charlie']);
  });
});

describe('DataTable onRowClick (review 9)', () => {
  const portalColumns: ColumnDef<Row>[] = [
    { id: 'name', header: 'Name', cell: (row) => row.name },
    {
      id: 'menu',
      header: 'Menu',
      // A popover-like node rendered elsewhere in the DOM: its events still bubble through React.
      cell: (row) => createPortal(<span>{`portal ${row.name}`}</span>, document.body),
    },
    {
      id: 'act',
      header: 'Act',
      cell: (row) => <Button size="sm">{`act ${row.name}`}</Button>,
    },
  ];
  const renderTable = () => {
    const onRowClick = vi.fn();
    render(
      <DataTable
        rows={rows.slice(0, 2)}
        rowKey={(row) => row.id}
        columns={portalColumns}
        pagination={{ mode: 'client', pageSize: 2 }}
        onRowClick={onRowClick}
      />
    );
    return onRowClick;
  };

  it('a plain click on a cell opens the row', () => {
    const onRowClick = renderTable();
    fireEvent.click(screen.getByText('Alice'));
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });

  it('a modified or non-primary click does not', () => {
    const onRowClick = renderTable();
    for (const modifier of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey'])
      fireEvent.click(screen.getByText('Alice'), { [modifier]: true });
    fireEvent.click(screen.getByText('Alice'), { button: 1 });
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('a click from a portal rendered by a cell does not', () => {
    const onRowClick = renderTable();
    fireEvent.click(screen.getByText('portal Alice'));
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('a click on a control in the row, or one already handled, does not', () => {
    const onRowClick = renderTable();
    fireEvent.click(screen.getByRole('button', { name: 'act Alice' }));
    const cell = screen.getByText('Bob');
    cell.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(cell);
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
