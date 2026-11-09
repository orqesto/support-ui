import { useCallback } from 'react';
import type { ConfirmIfWriting } from '../../presence/useWritingGuard';
import type { MessageDetailProps } from './types';

type Classify = NonNullable<MessageDetailProps['onClassify']>;

/**
 * Moving to spam asks first while a colleague writes a reply (thread presence spec §5.5). On
 * cancel the promise resolves without classifying, so the caller's busy state ends. Undefined
 * when there is no `onClassify`. Moved out of MessageDetail unchanged (file size).
 */
export const useGuardedClassify = (
  guard: ConfirmIfWriting,
  onClassify: MessageDetailProps['onClassify']
): Classify | undefined => {
  const guardedClassify = useCallback<Classify>(
    (action, ...rest) =>
      new Promise<void>((resolve, reject) => {
        const run = () => {
          Promise.resolve(onClassify?.(action, ...rest)).then(() => resolve(), reject);
        };
        if (action === 'move_to_spam' || action === 'confirm_spam') {
          guard('mark as spam', run, resolve);
        } else run();
      }),
    [guard, onClassify]
  );
  return onClassify ? guardedClassify : undefined;
};
