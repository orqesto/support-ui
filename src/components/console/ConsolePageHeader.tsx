import type { ReactNode } from 'react';

/**
 * Shared page header for every Console and Platform console page. Before this, all 16 pages
 * inlined their own `<h1>` (+ optional `<p>`), diverging into four wrapper shapes —
 * some dropped the subtitle, some the `flex-shrink-0` guard that keeps the header
 * pinned inside the fill-height flex shell. This unifies them: always shrink-0,
 * optional description, optional right-aligned actions.
 */
type ConsolePageHeaderProps = {
  title: string;
  description?: string;
  /** Right-aligned action(s), e.g. a primary Button. Switches to a justify-between row. */
  actions?: ReactNode;
};

export const ConsolePageHeader = ({ title, description, actions }: ConsolePageHeaderProps) => (
  <div className="flex flex-shrink-0 gap-4 justify-between items-center">
    <div>
      <h1 className="text-2xl font-bold text-foreground">{title}</h1>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
    {actions && <div className="flex flex-shrink-0 gap-2 items-center">{actions}</div>}
  </div>
);
