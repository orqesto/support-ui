import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useBackendVersion } from '@/hooks/useBackendVersion';

type Drift = 'sync' | 'patch' | 'minor' | 'major' | 'unknown';

const driftBetween = (left: string, right: string): Drift => {
  const parse = (ver: string): [number, number, number] | null => {
    const match = ver.match(/^(\d+)\.(\d+)\.(\d+)/);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
  };
  const lhs = parse(left);
  const rhs = parse(right);
  if (!lhs || !rhs) return 'unknown';
  if (lhs[0] !== rhs[0]) return 'major';
  if (lhs[1] !== rhs[1]) return 'minor';
  if (lhs[2] !== rhs[2]) return 'patch';
  return 'sync';
};

const dotColor: Record<Drift, string> = {
  sync: 'bg-emerald-500',
  patch: 'bg-emerald-500',
  minor: 'bg-amber-500',
  major: 'bg-red-500',
  unknown: 'bg-muted-foreground/40',
};

const driftLabel: Record<Drift, string> = {
  sync: 'In sync',
  patch: 'Patch-level drift',
  minor: 'Minor-version drift — FE bundle may be stale, try a hard refresh',
  major: 'Major-version drift — FE bundle is stale, hard refresh required',
  unknown: 'Checking…',
};

export const VersionStatus = () => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const beVersion = useBackendVersion();

  const feVersion = String(__APP_VERSION__);
  const feSha = String(__GIT_SHA__);
  const feBuildTime = String(__BUILD_TIME__);
  const be = beVersion.data;
  const drift: Drift = be ? driftBetween(feVersion, be.version) : 'unknown';

  // Compute viewport-relative coords for the portal popover when it opens.
  // Plain absolute positioning gets clipped by the sidebar's overflow-hidden;
  // a portal escapes the container, but then we need fixed coords keyed off
  // the trigger button's bounding rect (anchor at the button's right edge,
  // align bottom with the button's bottom so the chip stays visually
  // attached to the popover when it pops out).
  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPos({
      left: rect.right + 8, // 8px gap (matches old ml-2)
      bottom: window.innerHeight - rect.bottom,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (ev: MouseEvent) => {
      const target = ev.target as Node;
      if (popRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((val) => !val)}
        title={`${driftLabel[drift]} · click for details`}
        className="inline-flex items-center gap-1.5 px-1.5 py-1 rounded text-[10px] text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent transition-colors"
      >
        <span className={`inline-block w-2 h-2 rounded-full ${dotColor[drift]}`} aria-hidden />
        <span className="font-mono">v{be?.version ?? feVersion}</span>
      </button>
      {open && pos && createPortal(
        <div
          ref={popRef}
          role="dialog"
          aria-label="Version details"
          style={{ left: pos.left, bottom: pos.bottom }}
          className="fixed z-50 w-[220px] rounded-md border border-border bg-background shadow-lg p-3 text-[11px]"
        >
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border">
            <span className={`inline-block w-2 h-2 rounded-full ${dotColor[drift]}`} aria-hidden />
            <span className="text-foreground font-medium">{driftLabel[drift]}</span>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-muted-foreground">
            <dt>Backend</dt>
            <dd className="font-mono text-foreground">
              {be ? `v${be.version}` : '—'}
              {be?.gitSha && be.gitSha !== 'dev' && ` · ${be.gitSha.slice(0, 7)}`}
            </dd>
            <dt>Frontend</dt>
            <dd className="font-mono text-foreground">
              v{feVersion}
              {feSha !== 'dev' && ` · ${feSha.slice(0, 7)}`}
            </dd>
            {be?.buildTime && be.buildTime !== 'unknown' && (
              <>
                <dt>BE built</dt>
                <dd className="text-foreground/70">{be.buildTime}</dd>
              </>
            )}
            {feBuildTime !== 'unknown' && (
              <>
                <dt>FE built</dt>
                <dd className="text-foreground/70">{feBuildTime}</dd>
              </>
            )}
          </dl>
        </div>,
        document.body
      )}
    </div>
  );
};
