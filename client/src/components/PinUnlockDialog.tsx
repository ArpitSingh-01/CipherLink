import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KeyRound } from 'lucide-react';

interface PinUnlockDialogProps {
  onUnlock: (pin: string) => Promise<void>;
  error: string | null;
  loading: boolean;
}

export function PinUnlockDialog({ onUnlock, error, loading }: PinUnlockDialogProps) {
  const [pin, setPin] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleUnlock = async () => {
    if (!pin) {
      setLocalError('PIN is required');
      return;
    }
    setLocalError(null);
    await onUnlock(pin);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleUnlock();
    }
  };

  const displayError = error || localError;

  return (
    <div className="w-full max-w-sm p-6">
      <div className="text-center mb-6">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <KeyRound className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-bold mb-2">Unlock CipherLink</h2>
        <p className="text-sm text-muted-foreground">Enter your PIN to decrypt your identity</p>
      </div>
      <Input
        type="password"
        placeholder="Enter PIN"
        value={pin}
        onChange={(e) => {
          setPin(e.target.value);
          setLocalError(null);
        }}
        onKeyDown={handleKeyDown}
        className="mb-2"
        disabled={loading}
        data-testid="input-unlock-pin"
      />
      {displayError && <p className="text-sm text-destructive mb-2">{displayError}</p>}
      <Button
        className="w-full"
        onClick={handleUnlock}
        disabled={loading}
        data-testid="button-unlock"
      >
        {loading ? 'Unlocking...' : 'Unlock'}
      </Button>
    </div>
  );
}
