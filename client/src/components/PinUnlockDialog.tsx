/**
 * PinUnlockDialog component enforcing pin entry to decrypt local user identity.
 */
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KeyRound, ShieldAlert } from 'lucide-react';
import { motion } from 'framer-motion';

interface PinUnlockDialogProps {
  onUnlock: (pin: string) => Promise<boolean>;
}

export function PinUnlockDialog({ onUnlock }: PinUnlockDialogProps) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [lockoutTime, setLockoutTime] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [isShaking, setIsShaking] = useState(false);

  // Lockout countdown timer
  useEffect(() => {
    if (!lockoutTime) return;

    const interval = setInterval(() => {
      const remaining = Math.ceil((lockoutTime - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockoutTime(null);
        setCountdown(0);
        setError(null);
        setAttempts(0);
      } else {
        setCountdown(remaining);
        setError(`Too many failed attempts. Locked for ${remaining}s.`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lockoutTime]);

  const handleUnlock = async () => {
    if (lockoutTime) return;

    if (!pin) {
      setError('PIN is required');
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      return;
    }

    setLoading(true);
    setError(null);

    const success = await onUnlock(pin);
    setLoading(false);

    if (success) {
      setError(null);
      setAttempts(0);
    } else {
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);

      if (nextAttempts >= 5) {
        const lockoutEnd = Date.now() + 30_000;
        setLockoutTime(lockoutEnd);
        setCountdown(30);
        setError('Too many failed attempts. Locked for 30s.');
      } else {
        setError(`Invalid PIN. ${5 - nextAttempts} attempt(s) remaining.`);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading && !lockoutTime) {
      handleUnlock();
    }
  };

  const shakeVariants = {
    shake: {
      x: [0, -10, 10, -10, 10, -5, 5, 0],
      transition: { duration: 0.5 }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#050505]/95 backdrop-blur-md flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 350, damping: 25 }}
        className="w-full max-w-sm"
      >
        <motion.div
          variants={shakeVariants}
          animate={isShaking ? "shake" : ""}
          className="rounded-2xl border border-white/[0.04] bg-[#0a0a0a] p-6 shadow-2xl relative overflow-hidden"
        >
          {/* Top glowing strip */}
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-cyan-500 to-indigo-500" />
          
          <div className="text-center mb-6">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-colors duration-300 ${lockoutTime ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
              {lockoutTime ? <ShieldAlert className="w-8 h-8 animate-pulse" /> : <KeyRound className="w-8 h-8" />}
            </div>
            <h2 className="text-xl font-bold mb-2 text-white">Unlock CipherLink</h2>
            <p className="text-sm text-zinc-400">Enter your PIN to decrypt your identity</p>
          </div>

          <div className="space-y-4">
            <motion.div whileFocus={{ scale: 1.01 }} transition={{ type: "spring", stiffness: 300, damping: 15 }}>
              <Input
                type="password"
                placeholder="Enter PIN"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  if (!lockoutTime) setError(null);
                }}
                onKeyDown={handleKeyDown}
                disabled={loading || !!lockoutTime}
                className="bg-zinc-950 border-white/[0.05] text-center tracking-widest text-lg"
                data-testid="input-unlock-pin"
              />
            </motion.div>

            {error && (
              <p className={`text-sm text-center ${lockoutTime ? 'text-destructive font-medium animate-pulse' : 'text-amber-500'}`}>
                {error}
              </p>
            )}

            <Button
              className="w-full font-medium"
              onClick={handleUnlock}
              disabled={loading || !!lockoutTime}
              data-testid="button-unlock"
            >
              {loading ? 'Unlocking...' : lockoutTime ? `Locked (${countdown}s)` : 'Unlock Identity'}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
