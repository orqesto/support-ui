/**
 * The open thread's action guard (useWritingGuard), handed to the header's handlers, the meta
 * strip's assignee and team pickers and the merge dialog without threading it through every
 * layer. Outside a thread view the default runs the action at once.
 */
import { createContext, useContext } from 'react';
import { runAtOnce, type ConfirmIfWriting } from './useWritingGuard';

export const WritingGuardContext = createContext<ConfirmIfWriting>(runAtOnce);

export const useGuardAction = (): ConfirmIfWriting => useContext(WritingGuardContext);
