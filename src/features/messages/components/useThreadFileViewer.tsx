import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { FileViewer } from '@/components/shared/fileViewer/FileViewer';
import {
  attachmentItem,
  inlineImageName,
  isViewableInlineImage,
  MIN_VIEWABLE_IMAGE_PX,
  type ViewerItem,
} from '@/components/shared/fileViewer/fileViewerModel';
import type { MessageEvent } from '@/types';
import type { Attachment } from '@/types/ai';

/**
 * Every viewable item of the conversation, in thread order: per message, the pictures in its
 * text (body order, as rendered) and then its attachments. `elements[i]` is the `<img>` behind
 * an inline item (null for an attachment), so a pressed picture can find its own place.
 *
 * ⚠️ Pictures are read from the RENDERED thread: a message's markup is fetched only once its
 * bubble nears the screen (ThreadMessageItem → useInView), and a folded quote is not rendered.
 * Pictures of a message that has never been near the screen are therefore not in the list —
 * fetching every body of a long thread to find them is the request storm that hook prevents.
 * Attachments come from the thread's attachment list and are always complete.
 */
/**
 * An attached picture whose thumbnail has LOADED smaller than the viewable minimum on either
 * side — a signature icon, a 1×1 tracking pixel the mail carried as a file. Staging, 2026-11-04:
 * a forwarded chain put 18 such files in next/previous, among them 1×1, 1×129 and 16×16 ones.
 * A thumbnail not loaded yet (lazy) is kept: its size is unknown, and leaving out a real photo
 * is worse than one extra step.
 */
const isTinyAttachedPicture = (root: ParentNode | null, attachmentId: number): boolean => {
  const thumb = root?.querySelector<HTMLImageElement>(
    `img[data-viewer-attachment="${attachmentId}"]`
  );
  if (!thumb || !thumb.complete || thumb.naturalWidth === 0 || thumb.naturalHeight === 0) {
    return false;
  }
  return thumb.naturalWidth < MIN_VIEWABLE_IMAGE_PX || thumb.naturalHeight < MIN_VIEWABLE_IMAGE_PX;
};

export const collectThreadViewerItems = (
  root: ParentNode | null,
  thread: MessageEvent[],
  attachmentsByMessageId: Map<number, Attachment[]>,
  /** The file the agent pressed: always in the list, even when tiny. */
  keepAttachmentId: number | null = null
): { items: ViewerItem[]; elements: (HTMLImageElement | null)[] } => {
  const items: ViewerItem[] = [];
  const elements: (HTMLImageElement | null)[] = [];
  for (const msg of thread) {
    const bubble = root?.querySelector(`[data-viewer-event="${msg.id}"]`) ?? null;
    const images = bubble ? Array.from(bubble.querySelectorAll('img')) : [];
    let position = 0;
    for (const image of images) {
      if (!isViewableInlineImage(image)) continue;
      items.push({
        type: 'inline',
        key: `img:${msg.id}:${position}`,
        src: image.getAttribute('src') ?? '',
        name: inlineImageName(image),
      });
      elements.push(image);
      position += 1;
    }
    for (const attachment of attachmentsByMessageId.get(msg.id) ?? []) {
      if (attachment.id !== keepAttachmentId && isTinyAttachedPicture(root, attachment.id)) {
        continue;
      }
      items.push(attachmentItem(attachment));
      elements.push(null);
    }
  }
  return { items, elements };
};

type ViewerState = { items: ViewerItem[]; index: number };

/**
 * The thread's file viewer: pressing a chip or a picture opens it AT that item, with the whole
 * conversation to step through. The list is taken when the viewer opens and held while it is
 * open, so a message arriving meanwhile does not shift what "next" means.
 *
 * `resetKey` (the conversation id) closes it when the agent moves to another conversation.
 */
export const useThreadFileViewer = (
  rootRef: RefObject<HTMLElement | null>,
  sortedThread: MessageEvent[],
  attachmentsByMessageId: Map<number, Attachment[]>,
  resetKey: number
) => {
  const [state, setState] = useState<ViewerState | null>(null);
  const source = useRef({ sortedThread, attachmentsByMessageId });
  source.current = { sortedThread, attachmentsByMessageId };

  useEffect(() => setState(null), [resetKey]);

  const collect = useCallback(
    (keepAttachmentId: number | null = null) =>
      collectThreadViewerItems(
        rootRef.current,
        source.current.sortedThread,
        source.current.attachmentsByMessageId,
        keepAttachmentId
      ),
    [rootRef]
  );

  const openAttachment = useCallback(
    (attachmentId: number) => {
      const { items } = collect(attachmentId);
      const index = items.findIndex((item) => item.key === `att:${attachmentId}`);
      if (index !== -1) {
        setState({ items, index });
        return;
      }
      // Not in the thread's list (it changed under us): show it on its own.
      const attachment = Array.from(source.current.attachmentsByMessageId.values())
        .flat()
        .find((candidate) => candidate.id === attachmentId);
      if (attachment) setState({ items: [attachmentItem(attachment)], index: 0 });
    },
    [collect]
  );

  const openInlineImage = useCallback(
    (_eventId: number, image: HTMLImageElement) => {
      const { items, elements } = collect();
      const index = elements.indexOf(image);
      if (index !== -1) {
        setState({ items, index });
        return;
      }
      setState({
        items: [
          {
            type: 'inline',
            key: 'img:single',
            src: image.getAttribute('src') ?? '',
            name: inlineImageName(image),
          },
        ],
        index: 0,
      });
    },
    [collect]
  );

  const onIndexChange = useCallback(
    (index: number) => setState((current) => (current ? { ...current, index } : current)),
    []
  );
  const close = useCallback(() => setState(null), []);

  const viewer = state ? (
    <FileViewer
      items={state.items}
      index={state.index}
      onIndexChange={onIndexChange}
      onClose={close}
    />
  ) : null;

  return { openAttachment, openInlineImage, viewer, isOpen: state !== null };
};
