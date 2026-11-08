import { useState, useEffect, useCallback, useRef } from 'react';
import type React from 'react';
import type { LabelsStatus } from '@/components/shared/labelPickerText';
import { labelService, type Label } from '@/services/settings.service';
import type { Message } from '@/types';
import { logger } from '@/lib/logger';
import { hashNameToLabelColor } from '../inboxCardHelpers';

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;

/** The header's label lists and the bookkeeping of our own label writes. */
export function useHeaderLabelState() {
  const [messageLabels, setMessageLabels] = useState<Label[]>([]);
  const [allLabels, setAllLabels] = useState<Label[]>([]);
  const [labelsStatus, setLabelsStatus] = useState<LabelsStatus>('loading');
  /** Bumped to fetch the labels again (the picker opened after a failed load). */
  const [labelsAttempt, setLabelsAttempt] = useState(0);
  /**
   * Our label writes (tick, chip ×, create): how many started and how many settled. A load's
   * answer is applied only if NO write of ours was in flight at any moment during it — its list
   * may predate a write (a removed chip came back, a created one vanished). An answer that is not
   * applied is fetched again once every write has settled, so the screen still ends on the
   * server's list (a contact edit's new labels were otherwise never shown).
   */
  const labelWrites = useRef({ started: 0, settled: 0 });
  const refetchWhenWritesSettle = useRef(false);
  const beginLabelWrite = () => {
    labelWrites.current.started += 1;
  };
  const endLabelWrite = () => {
    labelWrites.current.settled += 1;
    const { started, settled } = labelWrites.current;
    if (refetchWhenWritesSettle.current && started === settled) {
      refetchWhenWritesSettle.current = false;
      setLabelsAttempt((attempt) => attempt + 1);
    }
  };
  return {
    messageLabels,
    setMessageLabels,
    allLabels,
    setAllLabels,
    labelsStatus,
    setLabelsStatus,
    labelsAttempt,
    setLabelsAttempt,
    labelWrites,
    refetchWhenWritesSettle,
    beginLabelWrite,
    endLabelWrite,
  };
}

type LabelState = ReturnType<typeof useHeaderLabelState>;

/** Load this thread's labels and the workspace's, again on a refresh key or a retry. */
export function useHeaderLabelsLoad({
  message,
  labelsRefreshKey,
  labelsAttempt,
  labelWrites,
  refetchWhenWritesSettle,
  setLabelsStatus,
  setLabelsAttempt,
  setMessageLabels,
  setAllLabels,
}: Pick<
  LabelState,
  | 'labelsAttempt'
  | 'labelWrites'
  | 'refetchWhenWritesSettle'
  | 'setLabelsStatus'
  | 'setLabelsAttempt'
  | 'setMessageLabels'
  | 'setAllLabels'
> & { message: Message; labelsRefreshKey?: number }): void {
  useEffect(() => {
    // Only the latest request's answer lands (a refresh or a new message overtakes an old one).
    let live = true;
    const atStart = { ...labelWrites.current };
    setLabelsStatus('loading');
    Promise.all([labelService.getMessageLabels(message.id), labelService.getLabels()])
      .then(([ml, al]) => {
        if (!live) return;
        const now = labelWrites.current;
        const quiet =
          atStart.started === atStart.settled &&
          now.started === atStart.started &&
          now.settled === atStart.settled;
        if (!quiet) {
          // A write overlapped this load: its answer may predate it, so keep the lists we hold
          // and ask again once every write has settled. The picker stays usable meanwhile —
          // left on 'loading', one hung write (the client has no timeout) froze it for good.
          if (now.started === now.settled) {
            // Nothing in flight any more: ask again right away (status stays 'loading').
            setLabelsAttempt((attempt) => attempt + 1);
          } else {
            setLabelsStatus('ready');
            refetchWhenWritesSettle.current = true;
          }
          return;
        }
        setMessageLabels(ml);
        setAllLabels(al);
        setLabelsStatus('ready');
      })
      .catch(() => {
        if (live) setLabelsStatus('error');
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps unchanged from MessageDetailHeader; the setters and refs passed in are stable
  }, [message.id, labelsRefreshKey, labelsAttempt]);
}

/** Tick / untick a label on this thread, and create one (assigned at once). */
export function useHeaderLabelHandlers({
  message,
  messageLabels,
  setMessageLabels,
  setAllLabels,
  beginLabelWrite,
  endLabelWrite,
  setShowLabelPicker,
}: Pick<
  LabelState,
  'messageLabels' | 'setMessageLabels' | 'setAllLabels' | 'beginLabelWrite' | 'endLabelWrite'
> & { message: Message; setShowLabelPicker: SetState<boolean> }) {
  const handleToggleLabel = useCallback(
    async (label: Label) => {
      beginLabelWrite();
      const assigned = messageLabels.some((lbl) => lbl.id === label.id);
      const prev = messageLabels;
      setMessageLabels(
        assigned ? messageLabels.filter((lbl) => lbl.id !== label.id) : [...messageLabels, label]
      );
      try {
        if (assigned) await labelService.removeLabelFromMessage(message.id, label.id);
        else await labelService.assignLabelToMessage(message.id, label.id);
      } catch (err) {
        logger.error('Failed to toggle label:', err);
        setMessageLabels(prev);
      } finally {
        endLabelWrite();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps unchanged from MessageDetailHeader; the setters and refs passed in are stable
    [message.id, messageLabels]
  );

  const handleCreateLabel = useCallback(
    async (name: string) => {
      beginLabelWrite();
      try {
        // Scope the new label to THIS message's department so it's immediately
        // applicable (and so non-admins, who can't create org-wide labels, succeed).
        // Broader multi-department scoping is done from Label settings.
        const created = await labelService.createLabel({
          name,
          color: hashNameToLabelColor(name),
          departmentIds: typeof message.departmentId === 'number' ? [message.departmentId] : [],
        });
        setAllLabels((prev) => [created, ...prev]);
        // Auto-assign the newly-created label so the user doesn't need to click it
        // again. We bypass handleToggleLabel here because the optimistic state
        // hasn't been told about `created` yet — assign directly.
        setMessageLabels((prev) => [...prev, created]);
        try {
          await labelService.assignLabelToMessage(message.id, created.id);
        } catch (assignErr) {
          logger.error('Failed to assign newly-created label:', assignErr);
          setMessageLabels((prev) => prev.filter((lbl) => lbl.id !== created.id));
        }
        setShowLabelPicker(false);
      } catch (err) {
        logger.error('Failed to create label:', err);
      } finally {
        endLabelWrite();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps unchanged from MessageDetailHeader; the setters and refs passed in are stable
    [message.id, message.departmentId]
  );

  return { handleToggleLabel, handleCreateLabel };
}
