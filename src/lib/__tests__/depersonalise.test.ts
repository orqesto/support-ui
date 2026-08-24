import { describe, it, expect } from 'vitest';
import { stripGreetingName } from '../depersonalise';

describe('stripGreetingName', () => {
  // The exact draft production offered as the answer to a cold pitch from a stranger.
  const productionCase =
    '<p>Hello Joy,</p><p>Thank you for your message.</p><p>We can confirm that your <strong>subscription has now been cancelled</strong>.</p>';

  it('removes the name a reply was addressed to', () => {
    const out = stripGreetingName(productionCase);
    expect(out).not.toContain('Joy');
    expect(out).toContain('Hello,');
    // The body is untouched — only the greeting is reliably about the recipient.
    expect(out).toContain('subscription has now been cancelled');
  });

  it.each([
    ['Hi Victoria, your refund is on its way', 'Victoria'],
    ['Dear Mr Mullins, thanks for writing', 'Mullins'],
    ['Hola Ana, hemos recibido tu mensaje', 'Ana'],
    ['Bonjour Camille, merci de votre message', 'Camille'],
    ['Hej Erik, tack för ditt meddelande', 'Erik'],
    ['Hallo Sanne, bedankt voor je bericht', 'Sanne'],
    ['Good morning Joy Lees, about your order', 'Joy'],
  ])('strips the name from %j', (input, name) => {
    expect(stripGreetingName(input)).not.toContain(name);
  });

  it('keeps the greeting in the language it was written in', () => {
    expect(stripGreetingName('Hola Ana, hemos recibido tu mensaje')).toContain('Hola,');
    expect(stripGreetingName('Bonjour Camille, merci')).toContain('Bonjour,');
    expect(stripGreetingName('Hej Erik, tack')).toContain('Hej,');
  });

  // Control cases — these MUST survive untouched. A rewrite that mangles every reply
  // would pass a "no name leaked" assertion while making the feature useless.
  it.each([
    'Hi there, thanks for getting in touch',
    'Hello, your order has shipped',
    'Hi Team, please see below',
    'Dear Support, I have a question',
    'Thanks for reaching out about your subscription',
    '',
  ])('leaves %j unchanged', (input) => {
    expect(stripGreetingName(input)).toBe(input);
  });

  it('does not strip a name that appears later in the body', () => {
    const text = 'Hello, I have passed this to Joy who owns billing.';
    expect(stripGreetingName(text)).toContain('Joy');
  });
});
