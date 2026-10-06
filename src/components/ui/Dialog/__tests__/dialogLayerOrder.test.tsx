import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Drawer } from '../../Drawer';
import { Dialog } from '../Dialog';
import { tooltipVariants } from '../../Tooltip/tooltip.styles';
import contactPanelSource from '@/components/contacts/ContactProfilePanel.tsx?raw';
import layoutSource from '@/components/layout/Layout.tsx?raw';
import gateSource from '@/components/subscription/SubscriptionGateOverlay.tsx?raw';

/**
 * FE audit 2026-09-29 C-H1: a Dialog (z-60) opened from an open Drawer (68/70) rendered UNDER the
 * drawer's backdrop — KB entry → Edit and ticket → Move department were unusable, and a click on the
 * form hit the backdrop and closed the drawer. jsdom does not stack, so this reads the layers
 * each surface actually declares and checks their order.
 */
const layerOf = (className: string): number => {
  const match = /(?:^|\s)z-\[(\d+)\]/.exec(className);
  if (!match) throw new Error(`no z-[n] layer in "${className}"`);
  return Number(match[1]);
};

/** Every `z-[n]` a source file declares. */
const layersIn = (source: string): number[] =>
  [...source.matchAll(/z-\[(\d+)\]/g)].map((match) => Number(match[1]));

afterEach(cleanup);

describe('the dialog layer', () => {
  it('a dialog opened over an open drawer sits above its backdrop and its panel', () => {
    render(
      <>
        <Drawer open onClose={() => {}} title="KB entry">
          <p>entry</p>
        </Drawer>
        <Dialog open onOpenChange={() => {}}>
          <p>Edit entry</p>
        </Dialog>
      </>
    );
    const dialogWrapper = screen.getByRole('dialog').parentElement as HTMLElement;
    const dialogLayer = layerOf(dialogWrapper.className);
    const drawerPanel = screen.getByText('KB entry').closest('div[class*="z-["]') as HTMLElement;
    const drawerBackdrop = document.querySelector(
      '[aria-hidden="true"][style*="z-index"]'
    ) as HTMLElement;
    expect(dialogLayer).toBeGreaterThan(layerOf(drawerPanel.className));
    expect(dialogLayer).toBeGreaterThan(Number(drawerBackdrop.style.zIndex));
  });

  it('above the contact profile panel and the mobile top bar', () => {
    render(
      <Dialog open onOpenChange={() => {}}>
        <p>x</p>
      </Dialog>
    );
    const dialogLayer = layerOf(
      (screen.getByRole('dialog').parentElement as HTMLElement).className
    );
    // Control: the sources do declare layers (an empty match would pass vacuously).
    expect(layersIn(contactPanelSource).length).toBeGreaterThan(0);
    expect(layersIn(layoutSource).length).toBeGreaterThan(0);
    expect(dialogLayer).toBeGreaterThan(Math.max(...layersIn(contactPanelSource)));
    expect(dialogLayer).toBeGreaterThan(Math.max(...layersIn(layoutSource)));
  });

  it('below what opens from inside a dialog (tooltips) and below the subscription gate', () => {
    render(
      <Dialog open onOpenChange={() => {}}>
        <p>x</p>
      </Dialog>
    );
    const dialogLayer = layerOf(
      (screen.getByRole('dialog').parentElement as HTMLElement).className
    );
    expect(dialogLayer).toBeLessThan(layerOf(tooltipVariants({})));
    expect(dialogLayer).toBeLessThan(Math.min(...layersIn(gateSource)));
  });
});
