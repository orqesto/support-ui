import { useEffect, useState } from 'react';
import {
  CONTACT_NOTES_CHANGED,
  ContactNotesIndicator,
  type LatestNotePreview,
} from '@/components/contacts/ContactNotesIndicator';
import { contactService, type ContactNote } from '@/services/contact.service';

export type NoteSummary = { count: number; latest: LatestNotePreview | null };

/**
 * The customer's note count and newest note for the message view's Customer tab LABEL, so it shows
 * from any tab. Loaded from the read-only `/api/contacts/note-summary` as soon as the message opens
 * (the full profile loads only with the tab, and creates a contact). Once the profile IS loaded
 * its notes are the truth — they already follow an add or delete. A note changed anywhere else
 * (the contact drawer) refetches.
 */
export function useCustomerNoteSummary(
  email: string,
  profileNotes: ContactNote[] | undefined
): NoteSummary {
  const [fetched, setFetched] = useState<NoteSummary>({ count: 0, latest: null });

  useEffect(() => {
    let current = true;
    setFetched({ count: 0, latest: null });
    if (!email) return;
    const load = () => {
      contactService.getNoteSummary(email).then(
        (summary) => {
          if (current) setFetched(summary);
        },
        // An older backend without the route, or no access: no icon, never an error.
        () => undefined
      );
    };
    load();
    window.addEventListener(CONTACT_NOTES_CHANGED, load);
    return () => {
      current = false;
      window.removeEventListener(CONTACT_NOTES_CHANGED, load);
    };
  }, [email]);

  if (profileNotes) return { count: profileNotes.length, latest: profileNotes[0] ?? null };
  return fetched;
}

/** The Customer tab label's note mark (nothing when the customer has no notes). */
export function useCustomerNotesMark(email: string, profileNotes: ContactNote[] | undefined) {
  const { count, latest } = useCustomerNoteSummary(email, profileNotes);
  return <ContactNotesIndicator count={count} latest={latest} />;
}
