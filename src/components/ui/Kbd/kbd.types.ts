import type { ReactNode } from 'react';
import type { KbdVariantsType } from './kbd.styles';

export type KbdProps = KbdVariantsType & {
  children: ReactNode;
  className?: string;
};
