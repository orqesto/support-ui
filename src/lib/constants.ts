// Pagination
export const PAGINATION = {
  DEFAULT_LIMIT: 5,
  DEFAULT_PAGE: 1,
};

// Similarity search
export const SIMILAR_RESULTS_LIMIT = 3;
/**
 * Raised 0.75 → 0.90. A cold pitch selling fake reviews matched a customer's
 * subscription-cancellation request at 0.855, and generic business English sits in a
 * broad 0.82–0.88 band where cosine stops telling two unrelated messages apart.
 *
 * The backend enforces the same floor and will not accept a lower one from the query
 * string (see RESPONSE_SIMILAR_MESSAGE_MIN_SIMILARITY), so this is the UI agreeing with
 * the server rather than the UI deciding.
 */
export const SIMILAR_RESULTS_MIN_SIMILARITY = 0.9;
