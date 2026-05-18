import { BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { ElementType } from 'react';

export interface StatCard {
  title: string;
  value: number | string;
  icon: ElementType;
  color: string;
  bg: string;
  borderColor: string;
  hint: string;
  onClick: () => void;
  isClickable?: boolean;
}

interface SLASectionProps {
  cards: StatCard[];
}

export function DashboardSLASection({ cards }: SLASectionProps) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
        SLA &amp; Resolution
      </h2>
      <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card
              key={card.title}
              onClick={card.isClickable ? card.onClick : undefined}
              className={`border-l-4 transition-all ${card.isClickable ? 'cursor-pointer hover:shadow-lg hover:-translate-y-1 hover:border-primary/50 group' : ''}`}
              style={{ borderLeftColor: card.borderColor }}
            >
              <CardHeader className="flex flex-row justify-between items-center pt-4 pb-2 space-y-0">
                <CardTitle className="text-sm font-medium transition-colors text-muted-foreground group-hover:text-foreground">
                  {card.title}
                </CardTitle>
                <div className={`${card.bg} p-2 rounded-xl ${card.isClickable ? 'group-hover:scale-110 transition-transform' : ''}`}>
                  <Icon className={`h-4 w-4 ${card.color}`} />
                </div>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="text-2xl font-bold tracking-tight transition-colors group-hover:text-primary">
                  {card.value}
                </div>
                <p className="flex gap-1 items-center text-xs text-muted-foreground mt-0.5">
                  <BarChart3 className="w-3 h-3" />
                  {card.hint}
                  {card.isClickable && <span className="ml-1 opacity-0 transition-opacity group-hover:opacity-100">→</span>}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

interface StatusRowCard {
  title: string;
  value: number;
  borderColor: string;
  onClick: () => void;
}

interface StatusBarSectionProps {
  label: string;
  cards: StatusRowCard[];
}

export function DashboardStatusBarSection({ label, cards }: StatusBarSectionProps) {
  const total = cards.reduce((s, c) => s + c.value, 0);
  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <div className="flex justify-between items-center">
          <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {label}
          </CardTitle>
          <span className="text-xs text-muted-foreground">{total} total</span>
        </div>
      </CardHeader>
      <CardContent className="pb-4 space-y-1.5">
        {cards.map((row) => (
          <button
            key={row.title}
            type="button"
            onClick={row.onClick}
            className="flex gap-3 items-center px-1 py-1 w-full rounded transition-colors group hover:bg-muted/50"
          >
            <div className="flex-shrink-0 w-2 h-2 rounded-full" style={{ backgroundColor: row.borderColor }} />
            <span className="w-36 text-sm font-medium text-left text-foreground/80 group-hover:text-foreground">{row.title}</span>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-muted">
              <div className="h-full rounded-full transition-all" style={{ width: `${total ? (row.value / total) * 100 : 0}%`, backgroundColor: row.borderColor }} />
            </div>
            <span className="w-6 text-sm font-semibold text-right">{row.value}</span>
            <span className="opacity-0 text-muted-foreground transition-opacity group-hover:opacity-100">→</span>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
