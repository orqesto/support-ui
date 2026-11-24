/** The document-type picker sits under a closed "Advanced" (settings quick wins, Task 3). Invented data. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));

import { DocumentationUploadForm } from '../DocumentationUploadForm';

afterEach(cleanup);

const noop = () => undefined;

describe('DocumentationUploadForm › document type', () => {
  it('is collapsed, named in the closed header, and opens to the picker', () => {
    render(
      <DocumentationUploadForm
        selectedFiles={[new File(['hello'], 'guide.pdf', { type: 'application/pdf' })]}
        selectedDeptIds={[]}
        documentType="general"
        isDragging={false}
        uploading={false}
        uploadProgress={{}}
        onFileSelect={noop}
        onDragOver={noop}
        onDragLeave={noop}
        onDrop={noop}
        onRemoveFile={noop}
        onSelectedDeptIdsChange={noop}
        onDocumentTypeChange={noop}
        onUpload={noop}
      />
    );
    const header = screen.getByRole('button', { name: /^Advanced/ });
    expect(header).toHaveTextContent('Document type: General');
    const help = screen.getByText('Standard documentation with quotable content');
    expect(help).not.toBeVisible();
    fireEvent.click(header);
    expect(help).toBeVisible();
  });
});
