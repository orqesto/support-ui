/**
 * "45m over", "2h over", "1h 30m over" — an SLA breach's overrun. Moved out of
 * NotificationCenter unchanged when that file reached its 650-line cap.
 */
export const formatBreachAmount = (minutes: number): string => {
  if (minutes < 60) return `${minutes}m over`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m over` : `${hours}h over`;
};
