import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

// Service mocks — the component talks to these four functions. Defined via vi.hoisted so
// they exist before the (hoisted) vi.mock factories reference them.
const { getAll, listConfluencePages, processConfluencePage, deleteDocumentation } = vi.hoisted(
  () => ({
    getAll: vi.fn(),
    listConfluencePages: vi.fn(),
    processConfluencePage: vi.fn(),
    deleteDocumentation: vi.fn(),
  })
);

vi.mock('@/services/integrations.service', () => ({
  integrationsService: { getAll, listConfluencePages, processConfluencePage },
}));
vi.mock('@/services/documentation.service', () => ({
  documentationService: { deleteDocumentation },
}));

import { ConfluenceCatalogSection } from '../ConfluenceCatalogSection';

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

const integration = { id: 7, type: 'confluence', name: 'Docs', config: { spaceKeys: ['SUP'] } };
const pages = [
  { id: 'p1', title: 'Alpha', parentId: null, spaceKey: 'SUP', processed: false, docId: null },
  {
    id: 'p2',
    title: 'Beta',
    parentId: null,
    spaceKey: 'SUP',
    processed: true,
    docId: 42,
    status: 'ready',
    enabled: true,
  },
];

const primeCatalog = () => {
  getAll.mockResolvedValue({ success: true, data: [integration] });
  listConfluencePages.mockResolvedValue({ success: true, data: { pages } });
};

describe('ConfluenceCatalogSection — visible catalog with per-page process/remove', () => {
  it('shows each page with the right action: unprocessed → Process, processed → Remove', async () => {
    primeCatalog();
    render(<ConfluenceCatalogSection />);

    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    // Unprocessed page offers to add it; processed page offers to remove it.
    expect(screen.getByRole('button', { name: /process as kb/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove from kb/i })).toBeInTheDocument();
  });

  it('Process as KB queues the page (async) and optimistically shows it processing', async () => {
    primeCatalog();
    processConfluencePage.mockResolvedValue({ success: true, data: { queued: true, pageId: 'p1' } });
    render(<ConfluenceCatalogSection />);

    fireEvent.click(await screen.findByRole('button', { name: /process as kb/i }));

    await waitFor(() => expect(processConfluencePage).toHaveBeenCalledWith(7, 'p1'));
    // Optimistic per-row state appears immediately — no full-list reload/blocking.
    expect(await screen.findByText(/processing/i)).toBeInTheDocument();
  });

  it('Remove from KB deletes by docId and flips just that row back to unprocessed', async () => {
    primeCatalog();
    deleteDocumentation.mockResolvedValue(undefined);
    render(<ConfluenceCatalogSection />);

    fireEvent.click(await screen.findByRole('button', { name: /remove from kb/i }));

    await waitFor(() => expect(deleteDocumentation).toHaveBeenCalledWith(42));
    // In-place: the removed page now shows a Process button (both rows unprocessed), no reload.
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /process as kb/i })).toHaveLength(2)
    );
  });

  it('renders nothing when there are no Confluence integrations', async () => {
    getAll.mockResolvedValue({ success: true, data: [] });
    const { container } = render(<ConfluenceCatalogSection />);
    await waitFor(() => expect(getAll).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
