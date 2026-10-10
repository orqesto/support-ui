import type { TemplateLookup } from '@/services/customApiTemplates.service';

/** A template step that ended with a lookup: saved in this run, or an existing one reused. */
export interface KeptStep {
  label: string;
  existing: boolean;
}

const stepWords = (numbers: number[]): string =>
  numbers.length === 1
    ? `Step ${numbers[0]}`
    : `Steps ${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`;

/**
 * F4: what a template applied IN PART left behind, in one or two sentences — or undefined when
 * nothing was kept (nothing to report) or every step was (nothing missing). A step not in `kept`
 * was skipped, or never reached because the admin left.
 */
export const partialTemplateNotice = (
  lookups: TemplateLookup[],
  kept: Record<number, KeptStep>
): string | undefined => {
  const keptSteps = lookups.map((_lookup, index) => index).filter((index) => kept[index]);
  const notAdded = lookups.map((_lookup, index) => index).filter((index) => !kept[index]);
  if (keptSteps.length === 0 || notAdded.length === 0) return undefined;
  const keptSentences = keptSteps.map((index) => {
    const { label, existing } = kept[index];
    return existing
      ? `Step ${index + 1} uses the existing “${label}”.`
      : `Step ${index + 1} was saved as “${label}”.`;
  });
  const numbers = notAdded.map((index) => index + 1);
  const missing =
    numbers.length === 1
      ? `${stepWords(numbers)} was not added — start the template again to add it.`
      : `${stepWords(numbers)} were not added — start the template again to add them.`;
  return [...keptSentences, missing].join(' ');
};
