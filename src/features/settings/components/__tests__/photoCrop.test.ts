/** The saved square is exactly the part of the photo the circle showed. */
import { describe, expect, it } from 'vitest';
import { clampView, FRAME_PX, visibleRegion } from '../photoCrop';

const landscape = { width: 1200, height: 800 };

describe('photo framing', () => {
  it('centred at zoom 1: the middle square of the short side', () => {
    expect(visibleRegion(landscape, { zoom: 1, offsetX: 0, offsetY: 0 })).toEqual({
      x: 200,
      y: 0,
      side: 800,
    });
  });

  it('zoom 2 shows half the side, still centred', () => {
    expect(visibleRegion(landscape, { zoom: 2, offsetX: 0, offsetY: 0 })).toEqual({
      x: 400,
      y: 200,
      side: 400,
    });
  });

  it('dragging the photo right shows more of its left side', () => {
    const region = visibleRegion(landscape, { zoom: 1, offsetX: 60, offsetY: 0 });
    expect(region.x).toBeLessThan(200);
  });

  it('a drag past the edge is pulled back so no empty corner can be saved', () => {
    const view = clampView(landscape, { zoom: 1, offsetX: 10_000, offsetY: -10_000 });
    const region = visibleRegion(landscape, view);
    expect(region.x).toBeCloseTo(0);
    expect(region.y).toBeCloseTo(0);
    expect(view.offsetY).toBeCloseTo(0);
    expect(FRAME_PX).toBe(240);
  });
});
