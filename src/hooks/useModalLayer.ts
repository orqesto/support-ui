import { useEffect, useRef, type RefObject } from 'react';

/*
  The modal layers open right now, oldest first. Shared by every Dialog and phone sheet, so with
  two stacked (a merge picker under its confirm) only the TOPMOST one answers Escape and holds
  Tab — each used to listen on the document for itself, and one Escape closed both: the agent
  pressed Esc on "Merge into one thread" and lost the picker's search results with it.
*/
const layers: symbol[] = [];
const isTopLayer = (token: symbol): boolean => layers[layers.length - 1] === token;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), ' +
  '[contenteditable="true"]';

const focusableIn = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hidden && !el.closest('[aria-hidden="true"]')
  );

export interface ModalLayerOptions {
  /** Called on Escape while this layer is the topmost one. */
  onEscape?: () => void;
  /**
   * Where focus goes when the layer opens with focus outside it: the container itself (it needs
   * `tabIndex={-1}`; a dialog, so the first control is not one Enter away), its first control (a
   * menu), or nowhere (the component places focus itself).
   */
  initialFocus?: 'container' | 'first' | 'none';
}

/**
 * Makes `ref` a modal layer while `active`: Tab and Shift+Tab wrap inside it, focus that lands
 * outside is brought back, and Escape calls `onEscape` — all only for the topmost open layer, so
 * stacked layers behave as a stack. A sheet that is modal to the eye (a scrim over the page) but
 * lets Tab walk out under the scrim is not modal to a keyboard user (message detail v4 audit).
 *
 * The callbacks are read through a ref: the effect depends on `active` alone, so a parent
 * re-rendering with a fresh arrow does not re-register the layer (and move it to the top).
 */
export const useModalLayer = (
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  options: ModalLayerOptions = {}
): void => {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;
    const token = Symbol('modal-layer');
    layers.push(token);

    const inside = (node: Node | null): boolean => node !== null && root.contains(node);
    const initial = optionsRef.current.initialFocus ?? 'container';
    if (initial !== 'none' && !inside(document.activeElement)) {
      const target = initial === 'first' ? (focusableIn(root)[0] ?? root) : root;
      target.focus({ preventScroll: true });
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopLayer(token)) return;
      if (event.key === 'Escape') {
        optionsRef.current.onEscape?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusableIn(root);
      const current = document.activeElement;
      if (items.length === 0) {
        event.preventDefault();
        root.focus({ preventScroll: true });
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (!inside(current)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (current === first || current === root)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const at = layers.indexOf(token);
      if (at !== -1) layers.splice(at, 1);
    };
  }, [ref, active]);
};

/** Tests only: how many modal layers are open. */
export const openModalLayersForTests = (): number => layers.length;
