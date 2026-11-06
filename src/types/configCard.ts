/**
 * A configuration object is always in exactly one of three conditions. Modelling
 * them explicitly is what stops a form from showing a draft as though it were the
 * live config — the ambiguity every one of these forms had.
 */
export type ConfigCardState = 'empty' | 'stored' | 'editing';
