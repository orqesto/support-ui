import { useState, useEffect, useRef } from 'react';
import type { Message } from '@/types';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { usePhoneDetailScroll } from '../usePhoneDetailScroll';
import { useIsPhone } from '../useIsPhone';
import type { PanelTab } from '../messageDetailConstants';

/** Which panel tab is open, and the layout it sits in (rail, sidebar, phone). */

export function usePanelTabs(message: Message, fullPage: boolean) {
  const [tab, setTab] = useState<PanelTab>('ai');
  const [panelOpen, setPanelOpen] = useState(false);
  // v3 full page = two columns, but only where there is room for a 312px sidebar; narrower,
  // the page keeps the slide-over layout so nothing is hidden.
  const isWide = useMediaQuery('(min-width: 1024px)');
  const [sideMetaEl, setSideMetaEl] = useState<HTMLDivElement | null>(null);
  const twoColumn = fullPage && isWide;
  // v4 mobile (<640px). Structure that moves on a phone keys on this; pure styling uses `max-sm:`.
  const isPhone = useIsPhone();
  // Phone scrolling: a new message and a new tab start at their top (usePhoneDetailScroll).
  const detailRootRef = useRef<HTMLDivElement>(null);
  usePhoneDetailScroll(detailRootRef, isPhone && !twoColumn, panelOpen ? tab : 'thread');

  // Reset panel when message changes
  useEffect(() => {
    setPanelOpen(false);
    setTab('ai');
  }, [message.id]);
  return {
    tab,
    setTab,
    panelOpen,
    setPanelOpen,
    sideMetaEl,
    setSideMetaEl,
    twoColumn,
    isPhone,
    detailRootRef,
  };
}
