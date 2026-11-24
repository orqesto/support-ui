/**
 * The documentation upload form and its team scope. "Shared with all teams" could not be
 * unticked: the form read the scope off the selection alone, the tick box reset the selection to
 * none, and the list of teams only showed once a team was already selected — so a document could
 * never be given to one team from this form. Invented data.
 */
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

afterEach(cleanup);

const file = new File(['text'], 'returns.txt', { type: 'text/plain' });
const onUpload = vi.fn();
let selected: number[] = [];
const Harness = () => {
  const [ids, setIds] = useState<number[]>([]);
  selected = ids;
  return (
    <DocumentationUploadForm
      selectedFiles={[file]}
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
});
