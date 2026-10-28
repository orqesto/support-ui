/** Invented runs and responses shared by the Zendesk import tests. */

/** An error shaped the way the api-client interceptor rejects (status + body on the Error). */
export const apiError = (status: number, body: unknown, message = 'Request failed') =>
  Object.assign(new Error(message), { status, data: body });

export const previewedRun = {
  id: 5,
  status: 'previewed',
  fileName: 'export.json.zip',
  fileSize: 1000,
  source: 'acme',
  options: {
    includeSpam: false,
    includeProbable: false,
    groupDepartments: {},
    defaultDepartmentId: null,
    defaultSourceId: null,
    agentUsers: {},
  },
  preview: {
    subdomain: 'acme',
    tickets: 110,
    unreadableLines: 0,
    notTickets: 0,
    // A re-import: 5 tickets already imported (2 of them spam), 4 unchanged spam, 1 whose thread
    // an agent deleted.
    counts: {
      new: 70,
      spam_new: 40,
      spamClosed: 46,
      messageId: 20,
      followup: 8,
      conflict: 2,
      mapped: 5,
      spam_mapped: 2,
      skipped_unchanged: 4,
      spam_skipped_unchanged: 4,
      skipped_deleted: 1,
    },
    conflicts: [{ ticketId: 1, conversationIds: [3, 4] }],
    conflictsListed: 1,
    groups: { Orders: 60, Info: 40 },
    toAddresses: { 'orders@shop.example': { count: 60, ours: true } },
    assignees: {
      'kurt@shop.example': { count: 30, odlyUserId: 9 },
      'nobody@shop.example': { count: 3, odlyUserId: null },
    },
  },
  report: null,
  progress: null,
  error: null,
  partsUploaded: 1,
  createdAt: '2026-10-22T10:00:00Z',
  updatedAt: '2026-10-22T10:00:00Z',
  finishedAt: null,
};

export const routeGet = (runs: unknown[]) => (url: string) => {
  if (url === '/api/imports/zendesk/runs')
    return Promise.resolve({ data: { success: true, data: runs } });
  if (url.startsWith('/api/departments'))
    return Promise.resolve({ data: { success: true, data: [{ id: 1, name: 'Support' }] } });
  if (url === '/api/integrations') return Promise.resolve({ data: { success: true, data: [] } });
  if (url.startsWith('/api/users'))
    return Promise.resolve({
      data: {
        success: true,
        data: {
          users: [{ id: 21, email: 'nobody@team.example', firstName: 'Nora', lastName: 'Body' }],
          pagination: { page: 1, limit: 100, total: 1, totalPages: 1, hasMore: false },
        },
      },
    });
  return Promise.resolve({ data: { success: true, data: runs[0] } });
};

export const uploadingRun = {
  ...previewedRun,
  id: 7,
  status: 'uploading',
  fileName: 'newer-export.json.zip',
  preview: null,
  report: null,
  partsUploaded: 2,
  // Nothing sent for months: stopped or lost, not running in another tab.
  updatedAt: '2026-01-01T10:00:00Z',
};

export const appliedRun = {
  ...previewedRun,
  id: 4,
  status: 'applied',
  fileName: 'first-export.json.zip',
  finishedAt: '2026-10-20T10:00:00Z',
  report: {
    tickets: 110,
    counts: { created: 12, messageId: 3, eventsAdded: 40, eventsMatched: 5, notesAdded: 2 },
    conflicts: [],
    failures: [],
    unmatchedAssignees: {},
    reconciled: 0,
  },
};
