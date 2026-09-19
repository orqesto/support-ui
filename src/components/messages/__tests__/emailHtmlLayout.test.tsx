import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ThreadBubble } from '../ThreadBubble';
import { useAuthStore } from '@/stores/authStore';

afterEach(() => {
  cleanup();
  useAuthStore.setState({ selectedOrganizationId: null });
});

/**
 * The shape SOM-INF-1579 actually has on staging, reduced. A `width="100%"` outer table, a fixed
 * logo cell, and a contact block whose geometry lives in `valign`/`align`/`width` and inline
 * `style` — every one of which the old sanitizer deleted. The visible result was a signature
 * whose columns collapsed into a single stack and whose contact line broke mid-token
 * ("natalie.antonenko@prefabh" / "ome.eu").
 */
const SIGNATURE = `
<table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td width="150" valign="top" align="center">
      <img src="https://vlc.xe10.lv/sig/logo.png" width="150" height="32" alt="Frame House">
    </td>
    <td valign="middle" align="left" style="padding-left:12px; color:#333333; font-size:13px">
      <b>Natalie Antonenko</b><br>
      Export manager | Frame House group SIA<br>
      <a href="mailto:natalie.antonenko@prefabhome.eu">natalie.antonenko@prefabhome.eu</a>
    </td>
  </tr>
</table>`;

const renderSignature = () => {
  useAuthStore.setState({ selectedOrganizationId: 21 });
  return render(<ThreadBubble content="" isAgent={false} html={SIGNATURE} eventId={6072} />);
};

describe('the two-column signature keeps its layout', () => {
  it('keeps both cells as siblings of one row, with their geometry intact', () => {
    const { container } = renderSignature();
    const rows = container.querySelectorAll('tr');
    expect(rows.length, 'the signature collapsed into more than one row').toBe(1);

    const cells = rows[0].querySelectorAll('td');
    expect(cells.length, 'the two columns did not survive as siblings').toBe(2);

    // The geometry that positions them. Every one of these was stripped before.
    expect(cells[0].getAttribute('width')).toBe('150');
    expect(cells[0].getAttribute('valign')).toBe('top');
    expect(cells[0].getAttribute('align')).toBe('center');
    expect(cells[1].getAttribute('valign')).toBe('middle');
    expect(cells[1].getAttribute('style')).toContain('padding-left: 12px');
  });

  it('keeps the table a real table — not flattened to a block', () => {
    // `[&_table]:block` contained overflow by destroying table layout. The email ground now
    // scrolls instead, so the table stays a table.
    const { container } = renderSignature();
    const ground = container.querySelector('table')?.closest('.overflow-x-auto');
    expect(ground).not.toBeNull();
    expect(ground?.className).not.toContain('[&_table]:block');
  });

  it('keeps the logo at the size the sender asked for', () => {
    const { container } = renderSignature();
    const img = container.querySelector('img');
    expect(img?.getAttribute('width')).toBe('150');
    expect(img?.getAttribute('height')).toBe('32');
  });

  it('gives the body the width email is designed for', () => {
    // 600px is the de-facto email design width. A `width="100%"` table with a 150px logo cell
    // had nowhere to go in a 524px bubble, which is what broke the contact line mid-token.
    const { container } = renderSignature();
    const body = container.querySelector('table')?.closest('[class*="min-w-"]');
    expect(body?.className).toContain('min-w-[min(600px,100%)]');
  });
});

describe('the ground an email renders on', () => {
  it('is light for an HTML body, in both themes', () => {
    // Not cosmetic: the sender sets `color:#333333` above and sets no background, as most
    // business mail does. On our blue agent bubble that is unreadable. The ground is fixed
    // rather than theme-following for exactly that reason — Gmail does the same.
    const { container } = renderSignature();
    const ground = container.querySelector('table')?.closest('.overflow-x-auto');
    expect(ground?.className).toContain('bg-white');
    expect(ground?.className).toContain('text-[#202124]');
    // The theme-inverting prose classes must NOT reach an email body.
    expect(ground?.className).not.toContain('prose-invert');
  });

  it('is light on an AGENT bubble too, where the bubble itself is saturated blue', () => {
    useAuthStore.setState({ selectedOrganizationId: 21 });
    const { container } = render(
      <ThreadBubble content="" isAgent={true} html={SIGNATURE} eventId={6072} />
    );
    const ground = container.querySelector('table')?.closest('.overflow-x-auto');
    expect(ground?.className).toContain('bg-white');
    expect(ground?.className).not.toContain('prose-invert');
  });

  it('leaves a PLAIN-TEXT body following the app theme, untouched', () => {
    // There is no sender styling to respect, so there is nothing to protect it from.
    const { container } = render(<ThreadBubble content={'Hello\n\nBest regards'} isAgent={true} />);
    expect(container.querySelector('.overflow-x-auto')).toBeNull();
    expect(container.querySelector('.prose')?.className).toContain('prose-invert');
  });
});

describe("the sender's own colours", () => {
  it('survive, so a sender who styles their mail gets what they asked for', () => {
    const { container } = renderSignature();
    const cell = container.querySelectorAll('td')[1];
    expect(cell.getAttribute('style')).toContain('color: #333333');
  });

  it('are readable, because the ground under them is light', () => {
    // The pair is the point: honouring `color:#333` on a blue ground would be WORSE than
    // stripping it. Neither assertion alone is the guarantee.
    const { container } = renderSignature();
    const ground = container.querySelector('table')?.closest('.overflow-x-auto');
    const cell = container.querySelectorAll('td')[1];
    expect(ground?.className).toContain('bg-white');
    expect(cell.getAttribute('style')).toContain('color: #333333');
  });
});
