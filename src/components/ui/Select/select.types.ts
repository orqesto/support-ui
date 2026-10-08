import type { Props as ReactSelectProps } from 'react-select';

export type Option = {
  value: string;
  label: string;
  menuLabel?: string;     // Title Case label shown in dropdown (falls back to label)
  chipClassName?: string; // Tailwind classes applied to chip control + option
  dotClassName?: string;  // Optional dot color for status-style indicators
  /** A stored colour (e.g. a label's hex) drawn as a dot before the text; sanitised before use. */
  color?: string;
  isDisabled?: boolean;
};

/** Same scale as `Input` — sm 32px / md 40px / lg 48px — so a Select beside an Input lines up. */
export type SelectSize = 'sm' | 'md' | 'lg';

/** Lists this long or longer get type-to-filter unless the caller says otherwise. */
export const SEARCHABLE_FROM = 8;

type BaseSelectProps = Omit<
  ReactSelectProps<Option, boolean>,
  'options' | 'value' | 'onChange' | 'isMulti' | 'isSearchable'
> & {
  label?: string;
  error?: string;
  /** Helper text under the control (hidden while `error` is shown). */
  hint?: string;
  options: Option[];
  /**
   * 'popover': your own trigger (an icon button, "Add label") opens a panel holding a search box and
   * the list — for pickers that live in headers and toolbars. Requires `trigger`.
   */
  variant?: 'default' | 'chip' | 'value' | 'popover';
  /** 'popover' only: renders the trigger; call `toggle` from its onClick. */
  trigger?: (state: { open: boolean; toggle: () => void }) => React.ReactNode;
  /** 'popover' only: which edge of the trigger the panel lines up with. Default 'start'. */
  align?: 'start' | 'end';
  /** 'popover' only: panel width in px (also what the on-screen clamp uses). Default 220. */
  popoverWidth?: number;
  /** 'popover' only: control the open state from the parent (both or neither). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 'popover' only: extra attributes for the panel (e.g. a `data-*` hook). */
  panelProps?: React.HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string | boolean>;
  /** Offer a "Create …" row for text that matches no option; `onCreate` receives the text. */
  creatable?: boolean;
  onCreate?: (input: string) => void;
  /** Text of the create row. Default: `Create "<input>"`. */
  createLabel?: (input: string) => string;
  /** 'default' variant only. Default 'md' (= Input md). Filter bars and toolbars pass 'sm'. */
  size?: SelectSize;
  /**
   * Show an × that empties the value — single emits `''`, multi `[]`. Use it where "no value" is a
   * legitimate state the user must be able to return to (what a picked "Choose…" option used to do).
   */
  clearable?: boolean;
  /** Type-to-filter. Default: on when there are `SEARCHABLE_FROM` or more options. */
  searchable?: boolean;
  disabled?: boolean;
  /** 'chip' only: 'sentence' drops the uppercase label (message detail v4 header). Default 'upper'. */
  chipCase?: 'upper' | 'sentence';
  /**
   * 'chip' / 'value' only, phones (<640px) only — message detail v4 mobile: the menu opens as a
   * bottom sheet (8px from the sides and bottom, 16px radius, 46px options at 15px, a dim scrim)
   * and the control grows to a touch size. Pure CSS behind `max-sm:`, so wider screens are
   * unchanged, and so is every caller that does not pass it.
   */
  mobileSheet?: boolean;
};

export type SingleSelectProps = BaseSelectProps & {
  multi?: false;
  value?: string;
  onChange?: (value: string) => void;
};

/** 'default' / 'popover' variants: a checklist menu that stays open, selected values shown as chips. */
export type MultiSelectProps = BaseSelectProps & {
  multi: true;
  value?: string[];
  onChange?: (value: string[]) => void;
};

export type SelectProps = SingleSelectProps | MultiSelectProps;
