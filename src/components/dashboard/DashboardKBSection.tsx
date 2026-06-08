import { BarChart3, BookOpen, FileText, MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

type Props = {
  kbQAPairs: number;
  kbDocuments: number;
  kbDocumentation: number;
};

export const DashboardKBSection = ({ kbQAPairs, kbDocuments, kbDocumentation }: Props) => {
  const navigate = useNavigate();

  const cards = [
    {
      label: 'Q&A',
      value: kbQAPairs,
      icon: MessageSquare,
      iconColor: 'text-cyan-600 dark:text-cyan-400',
      bg: 'bg-cyan-50 dark:bg-cyan-950/50',
      borderColor: '#0891b2',
      hint: 'Extracted pairs',
      path: '/knowledge-base#qa_pair',
    },
    {
      label: 'Documents',
      value: kbDocuments,
      icon: FileText,
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950/50',
      borderColor: '#059669',
      hint: 'Processed attachments',
      path: '/knowledge-base#document',
    },
    {
      label: 'Documentation',
      value: kbDocumentation,
      icon: BookOpen,
      iconColor: 'text-violet-600 dark:text-violet-400',
      bg: 'bg-violet-50 dark:bg-violet-950/50',
      borderColor: '#7c3aed',
      hint: 'Uploaded files',
      path: '/knowledge-base#documentation',
    },
  ];

  return (
    <div>
      <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
        Knowledge Base
      </h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((kb) => {
          const Icon = kb.icon;
          return (
            <Card
              key={kb.label}
              onClick={() => navigate(kb.path)}
              className="border-l-4 transition-all cursor-pointer hover:shadow-lg hover:-translate-y-1 hover:border-primary/50 group"
              style={{ borderLeftColor: kb.borderColor }}
            >
              <CardHeader className="flex flex-row justify-between items-center pt-4 pb-2 space-y-0">
                <CardTitle className="text-sm font-medium transition-colors text-muted-foreground group-hover:text-foreground">
                  {kb.label}
                </CardTitle>
                <div
                  className={`${kb.bg} p-2.5 rounded-xl group-hover:scale-110 transition-transform`}
                >
                  <Icon className={`h-5 w-5 ${kb.iconColor}`} />
                </div>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="text-2xl font-bold tracking-tight transition-colors group-hover:text-primary">
                  {kb.value}
                </div>
                <p className="flex gap-1 items-center text-xs text-muted-foreground mt-0.5">
                  <BarChart3 className="w-3 h-3" />
                  {kb.hint}
                  <span className="ml-1 opacity-0 transition-opacity group-hover:opacity-100">
                    →
                  </span>
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
