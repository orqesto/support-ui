/**
 * The documentation upload form and its team scope. "Shared with all teams" could not be
 * unticked: the form read the scope off the selection alone, the tick box reset the selection to
 * none, and the list of teams only showed once a team was already selected — so a document could
 * never be given to one team from this form. Invented data.
 */
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DocumentationUploadForm } from '../DocumentationUploadForm';

const teams = vi.hoisted(() => ({
  list: [
    { id: 1, name: 'Support team' },
    { id: 2, name: 'Sales team' },
  ] as Array<{ id: number; name: string }>,
  mode: true as boolean | undefined,
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: teams.list, teamsEnabled: teams.mode }),
}));

afterEach(() => {
  cleanup();
  teams.mode = true;
});

const file = new File(['text'], 'returns.txt', { type: 'text/plain' });
const onUpload = vi.fn();
let selected: number[] = [];
/** What the page does two seconds after a successful upload: no files, no teams. */
let clearAfterUpload: () => void = () => undefined;
const Harness = () => {
  const [ids, setIds] = useState<number[]>([]);
  const [files, setFiles] = useState<File[]>([file]);
  selected = ids;
  clearAfterUpload = () => {
    setFiles([]);
    setIds([]);
  };
  return (
    <DocumentationUploadForm
      selectedFiles={files}
      selectedDeptIds={ids}
      documentType={'general' as never}
      isDragging={false}
      uploading={false}
      uploadProgress={{}}
      onDragLeave={vi.fn()}
      onDragOver={vi.fn()}
      onDrop={vi.fn()}
      onFileSelect={vi.fn()}
      onRemoveFile={vi.fn()}
      onSelectedDeptIdsChange={setIds}
      onDocumentTypeChange={vi.fn()}
      onUpload={onUpload}
    />
  );
};
const shared = () => screen.getByLabelText<HTMLInputElement>(/Shared with all teams/);
const upload = () => screen.getByRole('button', { name: /^Upload 1 File$/ });

describe('Documentation upload: team scope', () => {
  it('unticking "Shared with all teams" shows the teams, and one can be picked', () => {
    render(<Harness />);
    expect(shared().checked).toBe(true);
    expect(screen.queryByLabelText('Sales team')).toBeNull();

    fireEvent.click(shared());
    expect(shared().checked).toBe(false);
    // No team picked yet: the upload is not offered, and the form says what to do.
    expect(upload()).toBeInactive();
    expect(screen.getByText(/Pick at least one team/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Sales team'));
    expect(selected).toEqual([2]);
    expect(screen.getByText('Visible to 1 team(s).')).toBeInTheDocument();
    expect(upload()).not.toBeInactive();
  });

  it('ticking it again clears the teams and shares with everyone', () => {
    render(<Harness />);
    fireEvent.click(shared());
    fireEvent.click(screen.getByLabelText('Support team'));
    expect(selected).toEqual([1]);
    fireEvent.click(shared());
    expect(selected).toEqual([]);
    expect(shared().checked).toBe(true);
    expect(screen.queryByLabelText('Support team')).toBeNull();
    expect(upload()).not.toBeInactive();
  });

  it('teams switched off after the box was unticked: Upload is offered, nothing hidden blocks it', () => {
    const view = render(<Harness />);
    fireEvent.click(shared());
    expect(upload()).toBeInactive();
    teams.mode = false;
    view.rerender(<Harness />);
    expect(screen.queryByText('Team scope')).toBeNull();
    expect(upload()).not.toBeInactive();
  });

  it('after an upload the page clears the form: the next one starts on "Shared with all teams"', () => {
    render(<Harness />);
    fireEvent.click(shared());
    fireEvent.click(screen.getByLabelText('Sales team'));
    expect(selected).toEqual([2]);
    act(() => clearAfterUpload());
    expect(shared().checked).toBe(true);
    expect(screen.queryByLabelText('Sales team')).toBeNull();
  });
});
