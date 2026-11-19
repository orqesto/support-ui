import { describe, expect, it } from 'vitest';
import { featureLabel } from '../ReasoningCard';

/**
 * Every feature id the backend serves in `options.features` (support-service
 * aiFeatureAudience.ts, 2026-11-19) has a readable name: the console showed
 * `translation_repair` and `telegram_thanks_check` raw.
 */
const SERVED_FEATURES = [
  'suggested_answer',
  'lead_qualification',
  'clarifying_questions',
  'follow_up',
  'missing_info',
  'response_rules',
  'chat_widget',
  'landing_assistant',
  'translation',
  'question_split',
  'translation_repair',
  'telegram_thanks_check',
  'answer_check',
  'ticket_enhance',
  'spam_detection',
  'billing_extraction',
  'ocr_refine',
  'kb_quality',
  'kb_consolidation',
  'kb_vision',
  'reply_style',
  'vision',
  'language_detection',
  'message_analysis',
  'message_enrichment',
  'routing_value_suggest',
  'routing_test',
  'contradiction_detection',
  'rule_seed_enrichment',
  'other',
];

describe('ReasoningCard feature names', () => {
  it.each(SERVED_FEATURES)('%s has a readable name, not its raw id', (feature) => {
    expect(featureLabel(feature)).not.toBe(feature);
  });

  it('the two ids reported raw read as words', () => {
    expect(featureLabel('translation_repair')).toBe('Translation repair (re-ask of a bad copy)');
    expect(featureLabel('telegram_thanks_check')).toBe('Telegram thank-you check');
  });
});
