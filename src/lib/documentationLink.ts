/** The stored chunk a source cites: by its place in the document, or by its own id. */
export type CitedChunk = { chunkIndex?: number | null; chunkId?: number | null };

const whole = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

/**
 * The address of an uploaded document (Settings › AI › Documentation), as a source link writes it.
 *
 * `?docId=` names the document and `&open=1` opens its preview there (without it the page only
 * shows the row: a "not updated" notification wants the row, not the text). `&chunk=` (the
 * stored chunk's index, 0-based) or `&chunkId=` (the chunk's id, when that is all the source
 * carries) also scrolls the preview to that section. The path is the Documentation tab's old
 * address, which redirects to Settings and keeps the query.
 */
export const documentationHref = (
  documentId: number | null | undefined,
  cited: CitedChunk = {}
): string => {
  if (!documentId) return '/knowledge-base#documentation';
  const chunk = whole(cited.chunkIndex)
    ? `&chunk=${cited.chunkIndex}`
    : whole(cited.chunkId)
      ? `&chunkId=${cited.chunkId}`
      : '';
  return `/knowledge-base?docId=${documentId}&open=1${chunk}#documentation`;
};

/** What a link names, read back from the address (`?docId=`, `&open=1`, `&chunk=`, `&chunkId=`). */
export type LinkedDocument = {
  docId?: number;
  /** The link asks for the document itself, not only its row in the list. */
  open: boolean;
  chunkIndex?: number;
  chunkId?: number;
};

export const readDocumentationLink = (search: URLSearchParams): LinkedDocument => {
  const wholeParam = (name: string): number | undefined => {
    const raw = search.get(name);
    return raw !== null && /^\d+$/.test(raw) ? Number(raw) : undefined;
  };
  return {
    docId: wholeParam('docId'),
    open: search.get('open') === '1',
    chunkIndex: wholeParam('chunk'),
    chunkId: wholeParam('chunkId'),
  };
};
