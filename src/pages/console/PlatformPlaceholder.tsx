import { useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { Construction } from 'lucide-react';

/**
 * P0 placeholder for Platform-console sections. The shell, routing, access guard and
 * nav entry land first (P0); each section's real surface — mostly reusing existing
 * admin components (Organizations, Billing/Plans, Usage, System, Users) — is wired in
 * P1. Renders a friendly "coming next" state so the console is navigable end-to-end.
 */
export const PlatformPlaceholder = () => {
  const { pathname } = useLocation();
  const segment = pathname.split('/').filter(Boolean).pop() ?? 'platform';
  const label =
    segment === 'platform' ? 'Overview' : segment.charAt(0).toUpperCase() + segment.slice(1);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{label}</h1>
        <p className="text-sm text-muted-foreground">Platform administration</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center">
            <Construction className="w-5 h-5 text-primary" />
            Coming next
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="info">
            <span className="text-sm">
              This platform section is being wired up. The console shell, navigation and
              access control are live; the {label} surface arrives in the next slice.
            </span>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
};
