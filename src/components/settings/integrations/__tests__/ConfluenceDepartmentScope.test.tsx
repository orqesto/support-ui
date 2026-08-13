import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfluenceDepartmentScope } from '../ConfluenceDepartmentScope';

// The control lists org departments via useDepartments(); mock it to a fixed set.
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({
    data: [
      { id: 1, name: 'Support' },
      { id: 2, name: 'Sales' },
      { id: 3, name: 'HR' },
    ],
    isLoading: false,
  }),
}));

afterEach(cleanup);

describe('ConfluenceDepartmentScope', () => {
  it('seeds a NEW connect to the admin’s own department(s)', () => {
    const onChange = vi.fn();
    render(
      <ConfluenceDepartmentScope
        value={undefined}
        onChange={onChange}
        seedDeptIds={[2]}
        isCreate={true}
      />
    );
    // Seeds on mount → scoped to the admin's dept.
    expect(onChange).toHaveBeenCalledWith([2]);
  });

  it('seeds a legacy EDIT (never-scoped source) to org-wide, preserving current behaviour', () => {
    const onChange = vi.fn();
    render(
      <ConfluenceDepartmentScope
        value={undefined}
        onChange={onChange}
        seedDeptIds={[2]}
        isCreate={false}
      />
    );
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('renders the org-wide state ([]) with the all-departments caption', () => {
    render(
      <ConfluenceDepartmentScope value={[]} onChange={vi.fn()} seedDeptIds={[2]} isCreate={false} />
    );
    expect(screen.getByText(/visible to every department/i)).toBeInTheDocument();
    // No dept chips in org-wide mode.
    expect(screen.queryByRole('button', { name: 'Sales' })).not.toBeInTheDocument();
  });

  it('renders scoped state ([ids]) with the department chips + scoped caption', () => {
    render(
      <ConfluenceDepartmentScope value={[1]} onChange={vi.fn()} seedDeptIds={[1]} isCreate={false} />
    );
    expect(screen.getByText(/only the selected departments/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Support' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sales' })).toBeInTheDocument();
  });

  it('clicking "All departments" switches to org-wide ([])', () => {
    const onChange = vi.fn();
    render(
      <ConfluenceDepartmentScope value={[1]} onChange={onChange} seedDeptIds={[1]} isCreate={false} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'All departments' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('entering "Specific departments" from org-wide seeds the admin’s dept(s)', () => {
    const onChange = vi.fn();
    render(
      <ConfluenceDepartmentScope value={[]} onChange={onChange} seedDeptIds={[3]} isCreate={false} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Specific departments' }));
    expect(onChange).toHaveBeenCalledWith([3]);
  });

  it('toggling a department chip adds it to the scoped set', () => {
    const onChange = vi.fn();
    render(
      <ConfluenceDepartmentScope value={[1]} onChange={onChange} seedDeptIds={[1]} isCreate={false} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sales' }));
    expect(onChange).toHaveBeenCalledWith([1, 2]);
  });

  it('toggling the last selected chip off collapses to org-wide ([])', () => {
    const onChange = vi.fn();
    render(
      <ConfluenceDepartmentScope value={[1]} onChange={onChange} seedDeptIds={[1]} isCreate={false} />
    );
    // Click the already-selected Support chip to deselect it.
    fireEvent.click(screen.getByRole('button', { name: 'Support' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
