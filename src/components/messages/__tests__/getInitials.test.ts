import { describe, it, expect } from 'vitest';
import { getInitials } from '../messageDetailConstants';

describe('getInitials', () => {
  it('ignores the quotes around a display name', () => {
    expect(getInitials('"Joel @ ngrok" <team@m.ngrok.com>')).toBe('JN');
  });
  it('CONTROL: a plain name and a bare address still work', () => {
    expect(getInitials('Marta Kowalczyk <marta@x.example>')).toBe('MK');
    expect(getInitials('ecttet@gmail.com')).toBe('EG');
    expect(getInitials('')).toBe('?');
  });
});
