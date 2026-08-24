/**
 * Strip the greeting from a reply written for somebody else.
 *
 * A past reply reused as a template arrives addressed to the customer it was written
 * for. Production sent an agent a draft opening "Hello Joy, … your subscription has now
 * been cancelled" — as the suggested answer to a cold pitch from a stranger selling fake
 * reviews. One click and a real customer's first name, and a claim about her account,
 * would have gone to a spammer.
 *
 * The greeting is the only part that is reliably about the recipient, so it is the only
 * part removed. The body may still contain specifics the agent must check; that is what
 * the sender attribution beside the option is for. This makes the reuse honest, not safe
 * — nothing here can make quoting someone else's correspondence automatic.
 */

/**
 * Salutations across the languages this product ships in. Deliberately anchored to the
 * start and required to be followed by a NAME-shaped token, so a reply that opens
 * "Hi there, thanks for getting in touch" (no name) is left exactly as it is.
 */
const GREETING_WITH_NAME =
  /^\s*(?:<p>\s*)?(?:hi|hello|hey|dear|good\s+(?:morning|afternoon|evening)|hola|estimad[oa]|buenos\s+d[ií]as|bonjour|cher|ch[eè]re|salut|hallo|beste|geachte|hej|hejsa|god\s+morgon|witaj|dzie[nń]\s+dobry|ciao|gentile|salve|ol[aá]|prezad[oa])\b[\s,]*([\p{Lu}][\p{L}'’-]*(?:\s+[\p{Lu}][\p{L}'’-]*){0,2})\s*[,!.]/iu;

/** Neutral replacements, matched to the greeting word that was actually used. */
const NEUTRAL_BY_GREETING: Record<string, string> = {
  hola: 'Hola,',
  estimado: 'Hola,',
  estimada: 'Hola,',
  bonjour: 'Bonjour,',
  cher: 'Bonjour,',
  chere: 'Bonjour,',
  chère: 'Bonjour,',
  salut: 'Bonjour,',
  hallo: 'Hallo,',
  beste: 'Hallo,',
  geachte: 'Hallo,',
  hej: 'Hej,',
  hejsa: 'Hej,',
  witaj: 'Witaj,',
  ciao: 'Ciao,',
  gentile: 'Salve,',
  salve: 'Salve,',
  ola: 'Olá,',
  olá: 'Olá,',
};

/**
 * Replace a named greeting with a neutral one. Returns the text unchanged when the
 * opening carries no name — there is then nothing belonging to another person in it.
 */
export function stripGreetingName(text: string): string {
  if (!text) return text;

  return text.replace(GREETING_WITH_NAME, (match, name: string) => {
    // "Hi Team," / "Dear Support," are role words, not a person — and rewriting them
    // would change a correctly-generic greeting into a different generic greeting.
    if (/^(?:team|support|sir|madam|all|everyone|customer|there)$/i.test(name.trim())) {
      return match;
    }

    const greetingWord = match.trim().replace(/^<p>\s*/i, '').split(/[\s,!.]/)[0];
    const neutral = NEUTRAL_BY_GREETING[greetingWord.toLowerCase()] ?? 'Hello,';
    const htmlPrefix = /^\s*<p>/i.test(match) ? match.match(/^\s*<p>\s*/i)?.[0] ?? '' : '';

    return `${htmlPrefix}${neutral}`;
  });
}
