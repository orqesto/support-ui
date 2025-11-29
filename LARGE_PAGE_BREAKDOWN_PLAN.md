# 📋 Large Page Breakdown - Detailed Plan

**Goal:** Break down 700+ line pages into focused, maintainable components

---

## **1. MessagesPage.tsx** (757 lines) → Target: ~400-450 lines

### **Current Structure Analysis:**

- Lines 1-50: Imports and state declarations
- Lines 51-250: Data fetching logic (fetchMessages, loadSingleMessage)
- Lines 251-400: Event handlers (onApprove, onReject, onDelete, etc.)
- Lines 401-550: URL synchronization and effects
- Lines 551-650: Render logic (filters, list, detail drawer)
- Lines 651-757: Dialog components and layout

### **Extractions Needed:**

#### **A. Custom Hook: useMessagesList** (~150 lines)

**Extract:**

- State: `messages`, `pagination`, `loading`, `refreshing`
- Logic: `fetchMessages`, `loadSingleMessage`, `handleRefresh`
- Cache management: `getCached`, `setMessages` store integration

**Benefit:** Reusable message fetching logic

#### **B. Component: MessagesList** (~100 lines)

**Extract:**

- Message list rendering
- Loading states
- Empty states
- Pagination controls

```tsx
<MessagesList
  messages={messages}
  loading={loading}
  selectedId={selectedMessage?.id}
  onSelect={handleMessageSelect}
  pagination={pagination}
  onPageChange={handlePageChange}
/>
```

#### **C. Component: MessageActionsBar** (~80 lines)

**Extract:**

- Primary actions (approve, reject, delete)
- Secondary actions (resolve, reopen)
- Confirmation dialogs

#### **D. Custom Hook: useMessageSync** (~50 lines)

**Extract:**

- URL parameter synchronization
- Deep linking logic
- Browser history management

**Estimated Final Size:** ~400-450 lines (-35-40%)

---

## **2. TicketsPage.tsx** (770 lines) → Target: ~420-470 lines

### **Current Structure:**

- State management: ~80 lines
- Data fetching: ~150 lines
- Jira sync logic: ~100 lines
- Event handlers: ~150 lines
- Render: ~200 lines
- Dialogs: ~90 lines

### **Extractions Needed:**

#### **A. Custom Hook: useTicketsList** (~150 lines)

- State: tickets, pagination, loading
- Fetch logic with filters
- Cache management

#### **B. Component: TicketsList** (~100 lines)

- Ticket list rendering
- Selection handling
- Empty/loading states

#### **C. Component: JiraSyncControls** (~80 lines)

- Jira integration dropdown
- Bulk sync button
- Sync status indicator

#### **D. Custom Hook: useTicketSync** (~50 lines)

- URL synchronization
- Deep linking

**Estimated Final Size:** ~420-470 lines (-39-45%)

---

## **3. DashboardPage.tsx** (758 lines) → Target: ~330-380 lines

### **Current Structure:**

- State + data fetching: ~100 lines
- Stats calculations: ~80 lines
- Chart data preparation: ~150 lines
- Render (stats cards): ~250 lines
- Render (charts + activity): ~178 lines

### **Extractions Needed:**

#### **A. Component: StatsCard** (~40 lines, reusable)

```tsx
<StatsCard
  title="Total Tickets"
  value={stats.totalTickets}
  change={stats.ticketChange}
  icon={<Ticket />}
  color="blue"
/>
```

**Usage:** 6 cards × 40 lines = 240 lines → becomes 6 × 10 lines = 60 lines
**Savings:** 180 lines

#### **B. Component: ActivityFeed** (~100 lines)

- Recent activity list
- Activity item rendering
- Time formatting

#### **C. Component: QuickActions** (~80 lines)

- Action button grid
- Navigation shortcuts

#### **D. Component: ChartCard** (~50 lines, reusable)

- Chart container
- Title/legend
- Loading states

**Estimated Final Size:** ~330-380 lines (-50-56%)

---

## **4. OrganizationPage.tsx** (794 lines) → Target: ~300-350 lines

### **Current Structure:**

- Tab state + data: ~80 lines
- Members management: ~250 lines
- Organization settings: ~200 lines
- Department management: ~180 lines
- Render/tabs: ~84 lines

### **Extractions Needed:**

#### **A. Component: MembersTab** (~200 lines)

- Member list table
- Invite/edit/remove actions
- Role management

#### **B. Component: OrganizationSettingsTab** (~150 lines)

- Settings form
- Update handlers
- Validation

#### **C. Component: DepartmentsTab** (~150 lines)

- Department list
- CRUD operations

**Estimated Final Size:** ~300-350 lines (-56-62%)

---

## **5. StatisticsPage.tsx** (782 lines) → Target: ~280-350 lines

### **Current Structure:**

- Data fetching: ~100 lines
- Chart data prep: ~200 lines
- Multiple chart renders: ~400 lines
- Stats grid: ~82 lines

### **Extractions Needed:**

#### **A. Custom Hook: useStatistics** (~120 lines)

- Fetch all statistics
- Date range handling
- Data transformations

#### **B. Component: StatCard** (~30 lines, reusable)

- Metric display
- Trend indicators
- Color variants

**Usage:** 8 cards × 30 lines = 240 lines → 8 × 8 lines = 64 lines
**Savings:** 176 lines

#### **C. Component: ChartSection** (~100 lines each)

- `TicketsByStatusChart`
- `MessagesByChannelChart`
- `ResponseTimeChart`
- `ResolutionRateChart`

**Estimated Final Size:** ~280-350 lines (-55-64%)

---

## **📊 TOTAL IMPACT ESTIMATE**

| Page                 | Current   | Target          | Savings         | Reduction  |
| -------------------- | --------- | --------------- | --------------- | ---------- |
| **MessagesPage**     | 757       | 400-450         | 307-357         | 41-47%     |
| **TicketsPage**      | 770       | 420-470         | 300-350         | 39-45%     |
| **DashboardPage**    | 758       | 330-380         | 378-428         | 50-56%     |
| **OrganizationPage** | 794       | 300-350         | 444-494         | 56-62%     |
| **StatisticsPage**   | 782       | 280-350         | 432-502         | 55-64%     |
| **TOTAL**            | **3,861** | **1,730-2,000** | **1,861-2,131** | **48-55%** |

---

## **🎯 IMPLEMENTATION PRIORITY**

### **Phase 1: Quick Wins (1 week)**

1. **DashboardPage** - Extract 6 StatsCard components → **~180 lines saved**
2. **StatisticsPage** - Extract 8 StatCard components → **~176 lines saved**
3. **Total:** ~350 lines, minimal complexity

### **Phase 2: List Pages (1 week)**

1. **MessagesPage** - Extract MessagesList + hooks → **~300 lines saved**
2. **TicketsPage** - Extract TicketsList + Jira controls → **~300 lines saved**
3. **Total:** ~600 lines, medium complexity

### **Phase 3: Complex Pages (1 week)**

1. **OrganizationPage** - Split into 3 tab components → **~450 lines saved**
2. **StatisticsPage** - Extract chart components → **~250 lines saved**
3. **Total:** ~700 lines, higher complexity

**Overall Potential: 1,650-2,100 lines saved across 3 weeks**

---

## **🔧 REUSABLE COMPONENTS TO CREATE**

### **Generic Components (usable everywhere):**

1. **`<StatCard />`** - Dashboard stat display
2. **`<ChartCard />`** - Chart container with title/legend
3. **`<EmptyState />`** - Consistent empty state display
4. **`<LoadingState />`** - Loading skeletons
5. **`<ErrorState />`** - Error display with retry
6. **`<ActionBar />`** - Action button groups
7. **`<DataTable />`** - Generic table component
8. **`<Pagination />`** - Reusable pagination

### **Custom Hooks:**

1. **`useDataFetch<T>`** - Generic data fetching with cache
2. **`useUrlSync`** - URL parameter synchronization
3. **`useConfirmDialog`** - Confirmation dialog state
4. **`usePagination`** - Pagination state management

---

## **📝 PATTERN TEMPLATE**

### **Before: Large Page (700+ lines)**

```tsx
export const LargePage = () => {
  // 50 lines of state
  // 100 lines of data fetching
  // 150 lines of event handlers
  // 400+ lines of render logic
  // Everything mixed together
};
```

### **After: Modular Page (~300-400 lines)**

```tsx
export const LargePage = () => {
  // Use custom hooks
  const { data, loading } = useDataFetch();
  const { filters, setFilter } = useFilters();

  // Render with components
  return (
    <PageLayout>
      <Filters {...} />
      <DataList items={data} loading={loading} />
      <DetailDrawer {...} />
    </PageLayout>
  );
}
```

---

## **✅ SUCCESS CRITERIA**

For each page refactoring:

- ✅ No breaking changes - all functionality preserved
- ✅ Page size reduced by 40-60%
- ✅ At least 2 reusable components created
- ✅ Type-safe with full TypeScript
- ✅ Zero lint errors
- ✅ Improved test coverage potential

---

## **🚀 NEXT STEPS**

1. **Review this plan** - Validate approach and priorities
2. **Start with DashboardPage** - Quickest wins with StatsCard extraction
3. **Create reusable components library** - Build common components as you go
4. **Test incrementally** - Verify each extraction works before moving on
5. **Document patterns** - Create component usage examples

**Ready to begin Phase 1 (Quick Wins) with DashboardPage!**
