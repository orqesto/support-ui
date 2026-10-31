import { useEffect, useState } from 'react';
import { logger } from '@/lib/logger';
import { assignmentService } from '@/services/assignment.service';
import { categoryService } from '@/services/category.service';
import { labelService } from '@/services/settings.service';
import type { TicketFilterSources } from './ticketFilterKeys';
import { userFullName } from '@/lib/userName';

type Sources = Omit<TicketFilterSources, 'jiraOn'>;

/** The values the tickets filter offers that live in the workspace: people, categories, labels. */
export const useTicketFilterSources = (): Sources => {
  const [sources, setSources] = useState<Sources>({ assignees: [], categories: [], labels: [] });

  useEffect(() => {
    let live = true;
    const patch = (part: Partial<Sources>) => {
      if (live) setSources((prev) => ({ ...prev, ...part }));
    };
    assignmentService
      .getAssignableUsers()
      .then((users) =>
        patch({
          assignees: users.map((user) => ({
            id: user.id,
            name: userFullName(user) || user.email,
          })),
        })
      )
      .catch((error) => logger.error('Failed to load assignees for the ticket filter:', error));
    categoryService
      .getAll()
      .then((res) =>
        patch({ categories: (res.data ?? []).map((cat) => ({ id: cat.id, name: cat.name })) })
      )
      .catch((error) => logger.error('Failed to load categories for the ticket filter:', error));
    labelService
      .getLabels()
      .then((labels) =>
        patch({
          labels: labels.map((label) => ({ id: label.id, name: label.name, color: label.color })),
        })
      )
      .catch((error) => logger.error('Failed to load labels for the ticket filter:', error));
    return () => {
      live = false;
    };
  }, []);

  return sources;
};
