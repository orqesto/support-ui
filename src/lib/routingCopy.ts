import { toast } from '@/lib/toast';

/** Spec §4.1: shown after a route — only when the backend recorded it as learning evidence. */
export const ROUTE_LEARNING_NOTE = 'Odly will suggest a rule once it sees this pattern again.';

export const showRouteLearningNote = (result: { learningRecorded: boolean } | undefined): void => {
  if (result?.learningRecorded === true) toast.info(ROUTE_LEARNING_NOTE);
};
