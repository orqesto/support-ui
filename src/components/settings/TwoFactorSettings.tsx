import { useState, useEffect } from 'react';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { twoFactorService } from '@/services/twoFactor.service';
import { logger } from '@/lib/logger';

type Phase = 'idle' | 'setup' | 'confirm' | 'disable';

export const TwoFactorSettings = () => {
  const [enabled, setEnabled] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    twoFactorService
      .getStatus()
      .then((s) => setEnabled(s.enabled))
      .catch((e: unknown) => logger.error('Failed to fetch 2FA status', e));
  }, []);

  const handleStartSetup = async () => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const data = await twoFactorService.setup();
      setQrCodeDataUrl(data.qrCodeDataUrl);
      setSecret(data.secret);
      setPhase('setup');
    } catch {
      setError('Failed to start 2FA setup. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEnable = async () => {
    if (!code) return;
    setError('');
    setLoading(true);
    try {
      await twoFactorService.enable(code);
      setEnabled(true);
      setPhase('idle');
      setCode('');
      setSuccess('2FA has been enabled successfully.');
    } catch {
      setError('Invalid code. Please try again.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async () => {
    if (!code) return;
    setError('');
    setLoading(true);
    try {
      await twoFactorService.disable(code);
      setEnabled(false);
      setPhase('idle');
      setCode('');
      setSuccess('2FA has been disabled.');
    } catch {
      setError('Invalid code. Please try again.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setPhase('idle');
    setCode('');
    setError('');
    setSuccess('');
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-start">
        <div className="mt-0.5">
          {enabled ? (
            <ShieldCheck className="w-5 h-5 text-green-500" />
          ) : (
            <ShieldOff className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">
            Two-factor authentication is{' '}
            <span className={enabled ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}>
              {enabled ? 'enabled' : 'disabled'}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {enabled
              ? 'Your account is protected with an authenticator app.'
              : 'Add an extra layer of security to your account.'}
          </p>
        </div>
        {phase === 'idle' && (
          <Button
            type="button"
            variant={enabled ? 'outline' : 'default'}
            size="sm"
            onClick={enabled ? () => setPhase('disable') : handleStartSetup}
            disabled={loading}
          >
            {enabled ? 'Disable' : 'Enable'}
          </Button>
        )}
      </div>

      {success && (
        <div className="p-3 text-sm text-green-700 bg-green-50 rounded-md dark:bg-green-950/30 dark:text-green-400">
          {success}
        </div>
      )}
      {error && (
        <div className="p-3 text-sm rounded-md text-destructive bg-destructive/10">{error}</div>
      )}

      {phase === 'setup' && (
        <div className="p-4 space-y-4 rounded-lg border border-border bg-muted/30">
          <p className="text-sm font-medium">Scan this QR code with your authenticator app</p>
          <div className="flex justify-center">
            <img src={qrCodeDataUrl} alt="2FA QR Code" className="w-48 h-48 rounded" />
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Or enter this key manually:</p>
            <code className="block px-2 py-1.5 text-xs font-mono rounded bg-background border border-border break-all">
              {secret}
            </code>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={() => { setPhase('confirm'); setCode(''); }}>
              I&apos;ve scanned it
            </Button>
          </div>
        </div>
      )}

      {phase === 'confirm' && (
        <div className="p-4 space-y-3 rounded-lg border border-border bg-muted/30">
          <p className="text-sm font-medium">Enter the 6-digit code to confirm</p>
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleEnable} disabled={code.length !== 6 || loading}>
              Confirm & enable
            </Button>
          </div>
        </div>
      )}

      {phase === 'disable' && (
        <div className="p-4 space-y-3 rounded-lg border border-destructive/30 bg-destructive/5">
          <p className="text-sm font-medium">Enter your authenticator code to disable 2FA</p>
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDisable}
              disabled={code.length !== 6 || loading}
            >
              Disable 2FA
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
