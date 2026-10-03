import { apiClient } from '@/lib/api-client';

/**
 * How many original-markup fetches may be in flight at once.
 *
 * A thread's bubbles ask for their markup as they scroll into view (useInView), so on a normal
 * open this is a handful. The cap is the guard for the case the viewport does not bound — a tall
 * screen over a thread of tiny bubbles, a fast scroll through hundreds — because the API limiter
 * is 1,000 requests a minute per address, and a thread of 1,887 messages once spent it in
 * seconds and took every other request of the browser down with it.
 */
export const HTML_FETCH_SLOTS = 4;
let inFlight = 0;
const waiting: (() => void)[] = [];

const takeSlot = (): Promise<void> =>
  new Promise((resolve) => {
    const start = () => {
      inFlight += 1;
      resolve();
    };
    if (inFlight < HTML_FETCH_SLOTS) start();
    else waiting.push(start);
  });

const releaseSlot = () => {
  inFlight -= 1;
  waiting.shift()?.();
};

/** For tests: how many fetches hold a slot right now. */
export const htmlFetchesInFlight = (): number => inFlight;

/**
 * The ORIGINAL HTML of one inbound message.
 *
 * Fetched per message rather than with the thread because production's stored markup averages
 * ~199 KB against ~18 KB of derived text — folding it into the thread payload would multiply
 * an ordinary inbox open for markup only the visible messages need.
 *
 * `null` is a normal answer: plenty of mail is genuinely plain text, and the caller keeps
 * rendering `content` in that case.
 */
export const getMessageHtml = async (eventId: number): Promise<string | null> => {
  await takeSlot();
  try {
    const res = await apiClient.get<{ data: { html: string | null } }>(
      `/api/messages/events/${eventId}/html`
    );
    return res.data.data.html;
  } finally {
    releaseSlot();
  }
};
