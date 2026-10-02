/**
 * relatedStyles — the v4 Related / merge-picker layout tokens. Each one carries the layout its
 * consumers rely on (a wrapping flex row, a heading that pushes actions right, the outline action,
 * the destructive cue, the 480px picker, a radio card, a truncated dim line). Emptied, the markup
 * still renders but loses that layout — this pins the classes that carry it.
 */
import { describe, expect, it } from 'vitest';
import {
  MG_DIALOG,
  MG_DIM,
  MG_OPTION,
  REL_BTN,
  REL_BTN_DANGER,
  REL_GROUP_ROW,
  REL_ROW,
  REL_SECTION_HEAD,
  REL_SECTION_TITLE,
} from '../relatedStyles';

const classes = (value: string) => value.split(/\s+/).filter(Boolean);

describe('relatedStyles', () => {
  it.each([
    ['REL_SECTION_HEAD', REL_SECTION_HEAD, ['flex', 'flex-wrap', 'items-center']],
    ['REL_SECTION_TITLE', REL_SECTION_TITLE, ['flex', 'flex-1', 'm-0', 'font-semibold']],
    ['REL_BTN', REL_BTN, ['h-auto', 'border', 'border-border', 'bg-card', 'text-[11.5px]']],
    ['REL_GROUP_ROW', REL_GROUP_ROW, ['flex', 'items-center', 'border-t', 'first:border-t-0']],
    ['REL_ROW', REL_ROW, ['flex', 'items-center', 'border', 'rounded-[7px]']],
    ['MG_DIALOG', MG_DIALOG, ['max-w-[480px]', 'rounded-[14px]']],
    ['MG_OPTION', MG_OPTION, ['flex', 'items-start', 'border', 'rounded-[10px]', 'bg-card']],
    ['MG_DIM', MG_DIM, ['text-muted-foreground', 'truncate']],
  ])('%s carries its layout', (_name, value, expected) => {
    expect(classes(value)).toEqual(expect.arrayContaining(expected));
  });

  it('REL_BTN_DANGER is the outline action plus the destructive cue', () => {
    expect(classes(REL_BTN_DANGER)).toEqual(
      expect.arrayContaining([
        ...classes(REL_BTN),
        '!text-destructive',
        'hover:bg-destructive-muted',
      ])
    );
  });
});
