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

  it('Process as KB calls processConfluencePage(integrationId, pageId) then reloads', async () => {
    primeCatalog();
    processConfluencePage.mockResolvedValue({ success: true, data: { docId: 99, status: 'ready' } });
    render(<ConfluenceCatalogSection />);

    fireEvent.click(await screen.findByRole('button', { name: /process as kb/i }));

    await waitFor(() => expect(processConfluencePage).toHaveBeenCalledWith(7, 'p1'));
    // Reloads the catalog to reflect the new processed state.
    expect(listConfluencePages).toHaveBeenCalledTimes(2);
  });

  it('Remove from KB deletes the doc by docId then reloads (page stays visible)', async () => {
    primeCatalog();
    deleteDocumentation.mockResolvedValue(undefined);
    render(<ConfluenceCatalogSection />);

    fireEvent.click(await screen.findByRole('button', { name: /remove from kb/i }));

    await waitFor(() => expect(deleteDocumentation).toHaveBeenCalledWith(42));
    expect(listConfluencePages).toHaveBeenCalledTimes(2);
  });

  it('renders nothing when there are no Confluence integrations', async () => {
    getAll.mockResolvedValue({ success: true, data: [] });
    const { container } = render(<ConfluenceCatalogSection />);
    await waitFor(() => expect(getAll).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
