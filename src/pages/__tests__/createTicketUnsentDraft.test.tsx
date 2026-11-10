/**
 * Create Ticket's kept title/description (useCreateTicketUnsentDraft): the thread's prefill, which
 * may load after the restore, never replaces what is on screen; Discard brings the prefill back.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { unsentDraftKey, writeUnsentDraft } from '@/lib/unsentDrafts';
import type { User } from '@/types';
import { useCreateTicketUnsentDraft } from '../useCreateTicketUnsentDraft';

type Form = { title: string; description: string };

const usePage = () => {
  const [formData, setFormData] = useState<Form>({ title: '', description: '' });
  const [touched, setTouched] = useState(false);
  const draft = useCreateTicketUnsentDraft({
    messageId: '9',
    formData,
    setFormData,
    touched,
    setTouched,
    created: false,
    fileCount: 0,
  });
  /** The page's thread load: the prefill goes through overPrefill. */
  const prefill = (title: string, description: string) =>
    setFormData((prev) => ({ ...prev, ...draft.overPrefill(prev, title, description) }));
  return { formData, setFormData, touched, prefill, draft };
};

beforeEach(() => {
  useAuthStore.setState({
    user: { id: 1 } as User,
    isAuthenticated: true,
    selectedOrganizationId: 5,
  });
});

describe('Create Ticket kept text', () => {
  it('an edit made after the restore survives the late thread prefill', () => {
    writeUnsentDraft(unsentDraftKey(1, 5, 'create-ticket:9')!, {
      title: 'Kept title',
      description: '<p>kept</p>',
    });
    const view = renderHook(usePage);
    expect(view.result.current.formData.title).toBe('Kept title');
    act(() => view.result.current.setFormData((prev) => ({ ...prev, title: 'Edited title' })));
    act(() => view.result.current.prefill('Thread subject', '<p>customer text</p>'));
    expect(view.result.current.formData.title).toBe('Edited title');
    expect(view.result.current.formData.description).toBe('<p>kept</p>');
  });

  it('CONTROL: nothing kept — the prefill applies', () => {
    const view = renderHook(usePage);
    act(() => view.result.current.prefill('Thread subject', '<p>customer text</p>'));
    expect(view.result.current.formData.title).toBe('Thread subject');
  });

  it('Discard brings the thread prefill back and the form is no longer "edited"', () => {
    writeUnsentDraft(unsentDraftKey(1, 5, 'create-ticket:9')!, {
      title: 'Kept title',
      description: '<p>kept</p>',
    });
    const view = renderHook(usePage);
    act(() => view.result.current.prefill('Thread subject', '<p>customer text</p>'));
    const { notice } = view.result.current.draft;
    expect(notice).not.toBeNull();
    act(() => (notice as { props: { onDiscard: () => void } }).props.onDiscard());
    expect(view.result.current.formData).toEqual({
      title: 'Thread subject',
      description: '<p>customer text</p>',
    });
    expect(view.result.current.touched).toBe(false);
  });
});
