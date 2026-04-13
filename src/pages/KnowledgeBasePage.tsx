import { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { FileText, MessageSquare, Settings, X, Filter, Library } from 'lucide-react';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import { KBEntryCard } from '@/components/kb/KBEntryCard';
import { KBEntryDetail } from '@/components/kb/KBEntryDetail';
import { KBTableView } from '@/components/kb/KBTableView';
import { Layout } from '@/components/layout/Layout';
import { DocumentationSettings } from '@/components/settings/DocumentationSettings';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { kbService, type KBEntry, type PaginationMeta } from '@/services/kb.service';
import { logger } from '@/lib/logger';

type FilterType = 'all' | 'qa_pair' | 'document' | 'documentation';
type FilterStatus = 'all' | 'approved' | 'pending' | 'hidden';

export const KnowledgeBasePage = () => {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Get active tab from URL hash, default to 'all'
  const activeTab = (location.hash.replace('#', '') || 'all') as FilterType;
  const [entries, setEntries] = useState<KBEntry[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingSearch, setPendingSearch] = useState('');
  const filterType = activeTab; // Use hash-based tab as filter type
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');

  // Handle tab change by updating URL hash
  const handleTabChange = (tabId: FilterType) => {
    window.location.hash = tabId;
  };
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<KBEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<KBEntry | null>(null);

  // Alert dialog state
  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: 'success' | 'error' | 'warning' | 'info';
  }>({ open: false, title: '', description: '', variant: 'info' });
  const fetchEntries = async (page = 1) => {
    try {
      setLoading(true);
      const response = await kbService.getAll({
        type: filterType === 'all' ? undefined : filterType,
        page,
        limit: pagination.limit,
        search: searchQuery || undefined,
        status: filterStatus === 'all' ? undefined : filterStatus,
      });
      setEntries(response.data.entries);
      setPagination(response.data.pagination);
    } catch (error) {
      logger.error('Failed to fetch KB entries:', error);
      setAlertDialog({
        open: true,
        title: 'Failed to Load',
        description: error instanceof Error ? error.message : 'Failed to fetch KB entries',
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  // Refetch when filters change (immediate, no debounce)
  // Skip fetching when on Documentation tab (shows settings, not KB entries)
  useEffect(() => {
    if (filterType !== 'documentation') {
      void fetchEntries(1); // Reset to page 1 when filters change
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterStatus, searchQuery]);

  // Handle ID URL parameter (e.g., /knowledge-base?id=123)
  // Similar to Messages and Tickets pages - keeps ID in URL for sharing and refresh
  useEffect(() => {
    const idParam = searchParams.get('id');
    if (idParam && !selectedEntry) {
      const id = parseInt(idParam, 10);
      if (!isNaN(id)) {
        // Fetch and open the specific entry
        void kbService
          .getById(id)
          .then((response: { data: KBEntry }) => {
            setSelectedEntry(response.data);
          })
          .catch((error: Error) => {
            logger.error('Failed to fetch KB entry:', error);
            setAlertDialog({
              open: true,
              title: 'Entry Not Found',
              description: 'Could not find the requested knowledge base entry.',
              variant: 'error',
            });
            // Remove invalid ID from URL
            const params = new URLSearchParams(searchParams);
            params.delete('id');
            setSearchParams(params, { replace: true });
          });
      }
    }
  }, [searchParams, selectedEntry, setSearchParams]);

  const handleSearch = () => {
    // Trigger actual search when button clicked or Enter pressed
    setSearchQuery(pendingSearch);
  };

  const handleSearchChange = (value: string) => {
    setPendingSearch(value);
    // If clearing the input (X button), also clear the active search
    if (!value.trim() && searchQuery) {
      setSearchQuery('');
    }
  };

  const handleSearchBlur = () => {
    // If search is empty on blur, clear the search filter to show all data
    if (!pendingSearch.trim() && searchQuery) {
      setSearchQuery('');
    }
  };

  const clearFilters = () => {
    handleTabChange('all');
    setFilterStatus('all');
    setSearchQuery('');
    setPendingSearch('');
  };

  const activeFilterCount =
    (filterType !== 'all' ? 1 : 0) +
    (filterStatus !== 'all' ? 1 : 0) +
    (searchQuery?.trim() ? 1 : 0);

  const handleApprove = async (id: number) => {
    try {
      await kbService.approve(id);
      // Update entry in place - set approved and unhidden
      setEntries((prev) =>
        prev.map((entry) => (entry.id === id ? { ...entry, approved: true, hidden: false } : entry))
      );
    } catch (error) {
      logger.error('Failed to approve entry:', error);
      setAlertDialog({
        open: true,
        title: 'Failed to Approve',
        description: error instanceof Error ? error.message : 'Failed to approve KB entry',
        variant: 'error',
      });
    }
  };

  const handleHide = async (id: number) => {
    try {
      await kbService.hide(id);
      // Update entry in place - set hidden
      setEntries((prev) =>
        prev.map((entry) => (entry.id === id ? { ...entry, hidden: true, approved: false } : entry))
      );
    } catch (error) {
      logger.error('Failed to hide entry:', error);
      setAlertDialog({
        open: true,
        title: 'Failed to Hide',
        description: error instanceof Error ? error.message : 'Failed to hide KB entry',
        variant: 'error',
      });
    }
  };

  const handleUpdate = (updatedEntry: KBEntry) => {
    // Update entry in the list
    setEntries((prev) =>
      prev.map((entry) => (entry.id === updatedEntry.id ? updatedEntry : entry))
    );
    setAlertDialog({
      open: true,
      title: 'Success',
      description: 'KB entry updated successfully',
      variant: 'success',
    });
  };

  // Handle opening entry - update URL with ID
  const handleOpenEntry = (entry: KBEntry) => {
    setSelectedEntry(entry);
    setSearchParams({ id: entry.id.toString() });
  };

  // Handle closing entry - remove ID from URL
  const handleCloseEntry = () => {
    setSelectedEntry(null);
    const params = new URLSearchParams(searchParams);
    params.delete('id');
    setSearchParams(params);
  };

  const handleDeleteClick = (entry: KBEntry) => {
    setEntryToDelete(entry);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!entryToDelete) {
      return;
    }

    setDeleting(true);
    try {
      await kbService.delete(entryToDelete.id);
      setDeleteDialogOpen(false);
      setEntryToDelete(null);
      await fetchEntries();
      setAlertDialog({
        open: true,
        title: 'Success',
        description: 'KB entry deleted',
        variant: 'success',
      });
    } catch (error) {
      logger.error('Failed to delete entry:', error);
      setAlertDialog({
        open: true,
        title: 'Delete Failed',
        description: 'Failed to delete entry',
        variant: 'error',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Layout>
      <div className="px-4 mx-auto space-y-4 w-full max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Knowledge Base</h2>
          <p className="text-sm text-muted-foreground">
            Review and manage automatically extracted knowledge from your messages
          </p>
        </div>

        {/* Tabs for Type Selection */}
        <Tabs
          tabs={
            [
              {
                id: 'all' as const,
                label: 'All',
                icon: Library,
                description: 'View all knowledge base entries',
              },
              {
                id: 'qa_pair' as const,
                label: 'Q&A Pairs',
                icon: MessageSquare,
                description: 'Questions and answers extracted from messages',
              },
              {
                id: 'document' as const,
                label: 'Documents',
                icon: FileText,
                description: 'Processed documents and attachments',
              },
              {
                id: 'documentation' as const,
                label: 'Documentation',
                icon: Settings,
                description: 'Configure KB extraction rules and settings',
              },
            ] satisfies Tab<FilterType>[]
          }
          activeTab={filterType}
          onTabChange={handleTabChange}
          variant="default"
          size="md"
          fullWidth
        />

        {/* Filters Card - Hidden in Documentation tab */}
        {filterType !== 'documentation' && (
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="space-y-4">
                {/* Header */}
                <div className="flex flex-wrap gap-3 justify-between items-center">
                  <div className="flex flex-wrap gap-3 items-center">
                    <div className="flex gap-2 items-center">
                      <Filter className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-semibold">Filters</span>
                      {activeFilterCount > 0 && (
                        <Badge variant="default" className="text-xs">
                          {activeFilterCount}
                        </Badge>
                      )}
                    </div>
                    {pagination.total > 0 && (
                      <span className="text-xs whitespace-nowrap text-muted-foreground">
                        {(pagination.page - 1) * pagination.limit + 1}-
                        {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                        {pagination.total}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 items-center">
                    {activeFilterCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearFilters}
                        className="h-8 shrink-0"
                      >
                        <X className="mr-1 w-3 h-3" />
                        Clear All
                      </Button>
                    )}
                  </div>
                </div>

                {/* Filter Controls */}
                <div className="flex flex-col gap-3">
                  {/* Search */}
                  <SearchInput
                    value={pendingSearch}
                    onChange={handleSearchChange}
                    onSearch={handleSearch}
                    onBlur={handleSearchBlur}
                    showSearchButton={true}
                    placeholder="Search by ID, title, content, or category..."
                    className="w-full"
                    size="sm"
                  />

                  {/* Status Filter */}
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">Status:</span>
                    <div className="flex rounded-md shadow-sm w-fit">
                      <Button
                        variant={filterStatus === 'approved' ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => setFilterStatus('approved')}
                        className="h-8 text-xs rounded-r-none rounded-l-md border-r-0"
                      >
                        Approved
                      </Button>
                      <Button
                        variant={filterStatus === 'pending' ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => setFilterStatus('pending')}
                        className="h-8 text-xs rounded-none border-r-0"
                      >
                        Pending
                      </Button>
                      <Button
                        variant={filterStatus === 'hidden' ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => setFilterStatus('hidden')}
                        className="h-8 text-xs rounded-none border-r-0"
                      >
                        Hidden
                      </Button>
                      <Button
                        variant={filterStatus === 'all' ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => setFilterStatus('all')}
                        className="h-8 text-xs rounded-r-md rounded-l-none"
                      >
                        All
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Documentation Tab Content */}
        {filterType === 'documentation' ? (
          <DocumentationSettings />
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="space-y-3 md:hidden">
              {loading ? (
                <div className="p-8 text-center">Loading...</div>
              ) : entries.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No entries found</div>
              ) : (
                entries.map((entry) => (
                  <KBEntryCard
                    key={entry.id}
                    entry={entry}
                    onView={handleOpenEntry}
                    onApprove={handleApprove}
                    onHide={handleHide}
                    onDelete={handleDeleteClick}
                  />
                ))
              )}
            </div>

            {/* Desktop Table View */}
            <KBTableView
              entries={entries}
              loading={loading}
              onView={handleOpenEntry}
              onApprove={handleApprove}
              onHide={handleHide}
              onDelete={handleDeleteClick}
            />

            {/* Pagination */}
            {!loading && pagination.totalPages > 1 && (
              <Pagination
                currentPage={pagination.page}
                totalPages={pagination.totalPages}
                total={pagination.total}
                limit={pagination.limit}
                onPageChange={(page) => void fetchEntries(page)}
                loading={loading}
              />
            )}


            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <DialogHeader>
                <DialogTitle>Delete KB Entry</DialogTitle>
                <DialogClose onClose={() => setDeleteDialogOpen(false)} />
              </DialogHeader>
              <DialogContent>
                <p>Are you sure you want to delete this entry? This action cannot be undone.</p>
                {entryToDelete && (
                  <div className="p-3 mt-3 bg-gray-50 rounded-md border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {entryToDelete.title}
                    </p>
                    <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                      Type: <span className="font-medium">{entryToDelete.type}</span> | Category:{' '}
                      <span className="font-medium">{entryToDelete.category}</span>
                    </p>
                  </div>
                )}
              </DialogContent>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDeleteDialogOpen(false)}
                  disabled={deleting}
                >
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleDeleteConfirm} isLoading={deleting}>
                  Delete
                </Button>
              </DialogFooter>
            </Dialog>
          </>
        )}

        {/* Entry Detail Drawer */}
        <KBEntryDetail
          entry={selectedEntry}
          onClose={handleCloseEntry}
          onApprove={handleApprove}
          onHide={handleHide}
          onDelete={handleDeleteClick}
          onUpdate={handleUpdate}
        />

        {/* Alert Dialog */}
        <AlertDialog
          open={alertDialog.open}
          onOpenChange={(open) => setAlertDialog({ ...alertDialog, open })}
          title={alertDialog.title}
          description={alertDialog.description}
          variant={alertDialog.variant}
        />
      </div>
    </Layout>
  );
};
