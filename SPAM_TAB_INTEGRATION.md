# Spam Tab Integration Guide for Messages Page

This guide shows you exactly how to add the Spam Logs tab to the Messages page.

## Step 1: Add Fetch Function (after fetchMessages function)

```typescript
const fetchSpamLogs = useCallback(
  async (page = 1, force = false) => {
    if (fetchingRef.current && !force) {
      return;
    }

    fetchingRef.current = true;
    setLoading(true);
    try {
      const response = await spamLogService.getAll(spam Filters, page, pagination.limit);

      if (response.success && response.data) {
        setSpamLogs(response.data);
        setPaginationLocal(response.pagination);

        if (page > response.pagination.totalPages && response.pagination.totalPages > 0) {
          await fetchSpamLogs(1);
        }
      }
    } catch (error) {
      console.error('Failed to fetch spam logs:', error);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  },
  [spamFilters, pagination.limit]
);
```

## Step 2: Add useEffect to fetch when tab changes

```typescript
// Add after existing useEffect hooks
useEffect(() => {
  if (!urlSyncedRef.current) return;

  if (activeTab === 'spam') {
    fetchSpamLogs(1).catch((error) => {
      console.error('Failed to fetch spam logs:', error);
    });
  }
}, [activeTab, fetchSpamLogs]);
```

## Step 3: Add Tab UI (replace the header section with this)

```tsx
<div className="mb-6 space-y-6">
  <div className="flex flex-wrap gap-3 justify-between items-center">
    <div className="flex items-center gap-3">
      <Mail className="w-6 h-6 text-primary" />
      <h1 className="text-2xl font-bold">Messages</h1>
    </div>
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
        <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
        Refresh
      </Button>
      <Button size="sm" onClick={handleCheckEmails}>
        Check Emails
      </Button>
    </div>
  </div>

  {/* Tabs */}
  <div className="flex gap-1 border-b">
    <button
      onClick={() => setActiveTab('messages')}
      className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
        activeTab === 'messages'
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      Messages
    </button>
    <button
      onClick={() => setActiveTab('spam')}
      className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
        activeTab === 'spam'
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      Spam Logs
    </button>
  </div>
</div>
```

## Step 4: Wrap existing content in conditional (replace the filters and messages list section)

```tsx
{
  activeTab === 'messages' ? (
    <>
      {/* Existing Messages Filters */}
      <div className="mb-6">
        <MessageFilters
          filters={filters}
          sorting={sorting}
          pendingSearch={pendingSearch}
          activeFilterCount={activeFilterCount}
          pagination={pagination}
          onFilterChange={handleFilterChange}
          onSearch={handleSearch}
          onSearchBlur={handleSearchBlur}
          onClearFilters={clearFilters}
          onSortingChange={(sortOrder) => setSorting({ sortOrder })}
          setPendingSearch={setPendingSearch}
          setFilters={setFilters}
        />
      </div>

      {/* Existing Messages List */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={`skeleton-${i}`} className="animate-pulse">
              <CardContent className="p-6">
                <div className="mb-4 w-3/4 h-4 bg-gray-200 rounded" />
                <div className="w-1/2 h-4 bg-gray-200 rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : messages.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Mail className="mx-auto mb-4 w-12 h-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">No messages found</h3>
            <p className="text-muted-foreground">
              {activeFilterCount > 0 ? 'No messages match your filters' : 'No messages available'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {messages.map((message) => (
            <MessageListItem
              key={message.id}
              message={message}
              onOpen={(msg) => {
                setSelectedMessage(msg);
                setSearchParams({ id: msg.id.toString() });
              }}
            />
          ))}
        </div>
      )}
    </>
  ) : (
    <>
      {/* Spam Logs Filters */}
      <div className="mb-6">
        <SpamFiltersComponent
          filters={spamFilters}
          pendingSearch={pendingSpamSearch}
          activeFilterCount={
            (spamFilters.channel ? 1 : 0) +
            (spamFilters.category ? 1 : 0) +
            (spamFilters.departmentRole ? 1 : 0) +
            (spamFilters.messageSourceId ? 1 : 0) +
            (spamFilters.search ? 1 : 0)
          }
          pagination={pagination}
          onFilterChange={(key, value) => setSpamFilters({ ...spamFilters, [key]: value })}
          onSearch={() => fetchSpamLogs(1)}
          onSearchBlur={() => {}}
          onClearFilters={() => {
            setSpamFilters({});
            setPendingSpamSearch('');
            fetchSpamLogs(1);
          }}
          onSortingChange={(sortOrder) => setSpamFilters({ ...spamFilters, sortOrder })}
          setPendingSearch={setPendingSpamSearch}
          setFilters={setSpamFilters}
        />
      </div>

      {/* Spam Logs List */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={`spam-skeleton-${i}`} className="animate-pulse">
              <CardContent className="p-6">
                <div className="mb-4 w-3/4 h-4 bg-gray-200 rounded" />
                <div className="w-1/2 h-4 bg-gray-200 rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : spamLogs.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Mail className="mx-auto mb-4 w-12 h-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">No spam logs found</h3>
            <p className="text-muted-foreground">No spam has been detected recently</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {spamLogs.map((log) => (
            <SpamLogListItem key={log.id} log={log} onOpen={setSelectedSpamLog} />
          ))}
        </div>
      )}
    </>
  );
}
```

## Step 5: Add Spam Log Detail Drawer (after the existing Message Detail Drawer)

```tsx
{
  /* Spam Log Detail Drawer */
}
{
  selectedSpamLog && (
    <Drawer
      open={!!selectedSpamLog}
      onClose={() => setSelectedSpamLog(null)}
      title="Spam Log Details"
    >
      <SpamLogDetail log={selectedSpamLog} onClose={() => setSelectedSpamLog(null)} />
    </Drawer>
  );
}
```

## Done! 🎉

The spam logs tab is now fully integrated with:

- ✅ Tab switching between Messages and Spam Logs
- ✅ Spam filtering (channel, category, department, etc.)
- ✅ List view with red flags display
- ✅ Detail drawer with full spam information
- ✅ Pagination support
- ✅ Loading states

All components reuse existing patterns from Messages/Tickets pages!
