import { describe, expect, it } from 'vitest';
import {
  emptyParameters,
  renderTemplatePreview,
  templateReadyToSend,
  type WhatsAppTemplate,
} from '@/components/messages/whatsappTemplates';

/**
 * The template preview and its send guard.
 *
 * The preview is the only thing standing between an agent and a billable message they
 * never read in full — the body is approved copy they did not write and cannot edit. It
 * must therefore agree with the backend's `renderTemplateBody` exactly; a preview that
 * disagreed would have the agent approve one message and the customer receive another.
 */

const template = (overrides: Partial<WhatsAppTemplate> = {}): WhatsAppTemplate => ({
  id: 5,
  name: 'order_update',
  language: 'en_US',
  category: 'UTILITY',
  bodyText: 'Hi {{1}}, order {{2}} shipped.',
  variableCount: 2,
  cost: 'Utility — low per-message rate',
  ...overrides,
});

describe('renderTemplatePreview', () => {
  it('substitutes positionally', () => {
    expect(renderTemplatePreview('Hi {{1}}, order {{2}} shipped.', ['Ana', 'A-77'])).toBe(
      'Hi Ana, order A-77 shipped.'
    );
  });

  it('replaces EVERY occurrence of a repeated index from one value', () => {
    // Mirrors the backend counting {{1}} twice as ONE parameter.
    expect(renderTemplatePreview('{{1}}, we mean it {{1}}', ['Ana'])).toBe('Ana, we mean it Ana');
  });

  it('leaves an unfilled placeholder visible instead of blanking it', () => {
    // A half-filled preview must read as unfinished, not as finished copy with a hole.
    expect(renderTemplatePreview('Hi {{1}} {{2}}', ['Ana', ''])).toBe('Hi Ana {{2}}');
    expect(renderTemplatePreview('Hi {{1}} {{2}}', ['Ana'])).toBe('Hi Ana {{2}}');
  });

  it('tolerates whitespace inside the braces, as the backend does', () => {
    expect(renderTemplatePreview('Hi {{ 1 }}', ['Ana'])).toBe('Hi Ana');
  });

  it('returns a body with no placeholders unchanged', () => {
    expect(renderTemplatePreview('We are closed today.', [])).toBe('We are closed today.');
  });

  it('is empty rather than "null" for a template with no body', () => {
    expect(renderTemplatePreview(null, [])).toBe('');
  });
});

describe('templateReadyToSend', () => {
  it('is ready once every parameter holds text', () => {
    expect(templateReadyToSend(template(), ['Ana', 'A-77'])).toBe(true);
  });

  it('refuses a blank parameter', () => {
    // The server compares parameter COUNT, not content, so a blank would pass its check
    // and reach the customer as a gap mid-sentence. This is the only guard against that.
    expect(templateReadyToSend(template(), ['Ana', ''])).toBe(false);
    expect(templateReadyToSend(template(), ['Ana', '   '])).toBe(false);
  });

  it('refuses the wrong number of parameters', () => {
    expect(templateReadyToSend(template(), ['Ana'])).toBe(false);
    expect(templateReadyToSend(template(), ['Ana', 'A-77', 'extra'])).toBe(false);
  });

  it('is ready immediately for a template that takes none', () => {
    expect(templateReadyToSend(template({ variableCount: 0 }), [])).toBe(true);
  });

  it('is never ready with nothing selected', () => {
    expect(templateReadyToSend(null, [])).toBe(false);
  });
});

describe('emptyParameters', () => {
  it('makes one blank slot per parameter', () => {
    expect(emptyParameters(template())).toEqual(['', '']);
    expect(emptyParameters(template({ variableCount: 0 }))).toEqual([]);
  });
});
