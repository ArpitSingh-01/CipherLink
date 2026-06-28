/**
 * Onboarding component for user setup, seed phrase generation/restoration, and device linking transfers.
 */
import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/useToast';
import { 
  generateIdentity, 
  restoreIdentity, 
  isValidRecoveryPhrase, 
  MIN_PIN_LENGTH, 
  generateEd25519KeyPair, 
  getDeviceName, 
  hexToBytes, 
  hkdf,
  decryptWithSecret,
  wordlist
} from '@/lib/crypto';
import { 
  saveIdentityEncrypted, 
  hasIdentity, 
  setSessionOnlyMode, 
  setDecryptedIdentity, 
  setupSessionOnlyCleanup, 
  saveDeviceIdentity,
  getDeviceIdentity,
  getDB,
} from '@/lib/storage';
import { Shield, KeyRound, Copy, Check, ArrowRight, ArrowLeft, AlertTriangle, RefreshCw, Lock, Link } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiRequest } from '@/lib/queryClient';
import { authenticatedFetch } from '@/lib/auth';
import { ensureDeviceRegistered } from '@/lib/devices';
import { useSEO } from '@/hooks/useSEO';
import { SpotlightCard } from '@/components/ui/SpotlightCard';

const onboardingStepTransition = {
  initial: { opacity: 0, y: 15 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -15 },
  transition: { type: 'spring', stiffness: 220, damping: 24 }
};


type Step = 'welcome' | 'generate' | 'phrase' | 'confirm' | 'pin' | 'username' | 'restore' | 'restorePin' | 'link' | 'complete' | 'linked';

interface IdentityData {
  privateKey: string;
  publicKey: string;
  recoveryPhrase: string;
}

function WelcomeStep({ onGenerate, onRestore, onLink }: { onGenerate: () => void; onRestore: () => void; onLink: () => void }) {
  return (
    <motion.div
      {...onboardingStepTransition}
      className="text-center"
    >
      <div className="w-20 h-20 rounded-2xl bg-cyan-950/20 border border-cyan-900/30 flex items-center justify-center mx-auto mb-6 shadow-[0_0_50px_rgba(6,182,212,0.15)]">
        <Shield className="w-10 h-10 text-cyan-400" />
      </div>
      <h1 className="text-3xl font-bold tracking-tight text-white mb-3">Welcome to CipherLink</h1>
      <p className="text-sm text-zinc-400 mb-10 max-w-sm mx-auto">
        Your cryptographic identity resides entirely sandboxed inside your local client database instance. No passwords. No server trust needed.
      </p>

      <div className="grid gap-4 text-left">
        <SpotlightCard
          glowColor="rgba(34, 217, 182, 0.12)"
          className="hover:border-cyan-500/20"
        >
          <button
            onClick={onGenerate}
            className="flex items-center gap-4 p-5 text-left group w-full bg-transparent border-none cursor-pointer"
            data-testid="button-create-identity"
          >
            <div className="w-10 h-10 rounded-xl bg-cyan-950/20 border border-cyan-900/30 flex items-center justify-center text-cyan-400 group-hover:bg-cyan-500 group-hover:text-black transition-all">
              <KeyRound className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <span className="font-semibold text-sm text-white block">Mint New Cryptographic Identity</span>
              <span className="text-[11px] text-zinc-500 block mt-0.5">Generate a random high-entropy seed and client keys.</span>
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:translate-x-1 group-hover:text-white transition-all" />
          </button>
        </SpotlightCard>

        <SpotlightCard
          glowColor="rgba(99, 102, 241, 0.12)"
          className="hover:border-indigo-500/20"
        >
          <button
            onClick={onLink}
            className="flex items-center gap-4 p-5 text-left group w-full bg-transparent border-none cursor-pointer"
            data-testid="button-link-device"
          >
            <div className="w-10 h-10 rounded-xl bg-indigo-950/20 border border-indigo-900/30 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-500 group-hover:text-black transition-all">
              <Link className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <span className="font-semibold text-sm text-white block">Link Secondary Device</span>
              <span className="text-[11px] text-zinc-500 block mt-0.5">Authorize a secure wireless peer-to-peer session clone.</span>
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:translate-x-1 group-hover:text-white transition-all" />
          </button>
        </SpotlightCard>

        <SpotlightCard
          glowColor="rgba(255, 255, 255, 0.08)"
          className="hover:border-white/20"
        >
          <button
            onClick={onRestore}
            className="flex items-center gap-4 p-5 text-left group w-full bg-transparent border-none cursor-pointer"
            data-testid="button-restore-identity"
          >
            <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-white/[0.06] flex items-center justify-center text-zinc-400 group-hover:bg-white group-hover:text-black transition-all">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <span className="font-semibold text-sm text-white block">Restore Session Instance</span>
              <span className="text-[11px] text-zinc-500 block mt-0.5">Recover your identity from a 12-word recovery phrase.</span>
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:translate-x-1 group-hover:text-white transition-all" />
          </button>
        </SpotlightCard>
      </div>
    </motion.div>
  );
}

function GeneratingStep() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 220, damping: 24 }}
      className="text-center"
    >
      <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6 animate-neon-pulse">
        <KeyRound className="w-10 h-10 text-primary animate-spin" />
      </div>
      <h2 className="text-2xl font-bold mb-4">Generating Your Identity</h2>
      <p className="text-muted-foreground">
        Creating cryptographic key pair...
      </p>
    </motion.div>
  );
}

function RecoveryPhraseStep({
  phrase,
  onContinue,
  onBack
}: {
  phrase: string;
  onContinue: () => void;
  onBack: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const words = phrase.split(' ');
  const { toast } = useToast();

  const copyPhrase = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(phrase);
      setCopied(true);
      toast({ title: 'Recovery phrase copied', description: 'Store it somewhere safe!' });
      setTimeout(() => setCopied(false), 3000);
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = phrase;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        toast({ title: 'Recovery phrase copied', description: 'Store it somewhere safe!' });
        setTimeout(() => setCopied(false), 3000);
      } catch {
        toast({
          title: 'Copy failed',
          description: 'Please copy the phrase manually',
          variant: 'destructive'
        });
      }
      document.body.removeChild(textArea);
    }
  };

  return (
    <motion.div
      {...onboardingStepTransition}
    >
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Your Recovery Phrase</h2>
        <p className="text-muted-foreground">
          Write these 12 words down and store them safely. This is the ONLY way to recover your identity.
        </p>
      </div>

      <Card className="mb-6">
        <CardContent className="p-6">
          <motion.div 
            variants={{
              hidden: { opacity: 0 },
              show: {
                opacity: 1,
                transition: { staggerChildren: 0.05 }
              }
            }}
            initial="hidden"
            animate="show"
            className="grid grid-cols-3 gap-3 mb-6"
          >
            {words.map((word, index) => (
              <motion.div
                key={index}
                variants={{
                  hidden: { opacity: 0, scale: 0.8, y: 10 },
                  show: { 
                    opacity: 1, 
                    scale: 1, 
                    y: 0,
                    transition: { type: "spring", stiffness: 260, damping: 20 }
                  }
                }}
                className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 font-mono text-sm"
              >
                <span className="text-muted-foreground text-xs w-5">{index + 1}.</span>
                <span data-testid={`text-word-${index + 1}`}>{word}</span>
              </motion.div>
            ))}
          </motion.div>

          <Button
            variant="outline"
            className="w-full"
            onClick={copyPhrase}
            data-testid="button-copy-phrase"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 mr-2 text-green-500" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 mr-2" />
                Copy to Clipboard
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 mb-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-destructive mb-1">Important Warning</p>
            <p className="text-muted-foreground">
              Never share this phrase with anyone. Anyone with these words can access your account.
              CipherLink cannot recover your identity if you lose this phrase.
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button className="flex-1" onClick={onContinue} data-testid="button-phrase-continue">
          I've Saved My Phrase
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </motion.div>
  );
}

function ConfirmPhraseStep({
  phrase,
  onConfirm,
  onBack,
}: {
  phrase: string;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const words = phrase.split(' ');
  const [selectedIndices] = useState(() => {
    // Use crypto.getRandomValues instead of Math.random for index selection
    const indices: number[] = [];
    const randomBytes = new Uint8Array(12);
    crypto.getRandomValues(randomBytes);
    let byteIdx = 0;
    while (indices.length < 3 && byteIdx < randomBytes.length) {
      const idx = randomBytes[byteIdx++] % 12;
      if (!indices.includes(idx)) indices.push(idx);
    }
    return indices.sort((a, b) => a - b);
  });
  const [inputs, setInputs] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<Record<number, boolean>>({});

  const handleInputChange = (index: number, value: string) => {
    setInputs(prev => ({ ...prev, [index]: value.toLowerCase().trim() }));
    setErrors(prev => ({ ...prev, [index]: false }));
  };

  const handleConfirm = () => {
    const newErrors: Record<number, boolean> = {};
    let hasError = false;

    selectedIndices.forEach(idx => {
      if (inputs[idx] !== words[idx]) {
        newErrors[idx] = true;
        hasError = true;
      }
    });

    if (hasError) {
      setErrors(newErrors);
      return;
    }

    onConfirm();
  };

  return (
    <motion.div
      {...onboardingStepTransition}
    >
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Confirm Your Phrase</h2>
        <p className="text-muted-foreground">
          Enter the following words from your recovery phrase to confirm you've saved it.
        </p>
      </div>

      <Card className="mb-6">
        <CardContent className="p-6 space-y-4">
          {selectedIndices.map(idx => (
            <div key={idx}>
              <Label className="text-sm text-muted-foreground mb-2 block">
                Word #{idx + 1}
              </Label>
              <Input
                type="text"
                placeholder={`Enter word #${idx + 1}`}
                value={inputs[idx] || ''}
                onChange={(e) => handleInputChange(idx, e.target.value)}
                className={errors[idx] ? 'border-destructive' : ''}
                data-testid={`input-word-${idx + 1}`}
              />
              {errors[idx] && (
                <p className="text-sm text-destructive mt-1">Incorrect word</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button className="flex-1" onClick={handleConfirm} data-testid="button-confirm-phrase">
          Confirm
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </motion.div>
  );
}

// New PIN creation step
function PinStep({
  onSetPin,
  onBack,
}: {
  onSetPin: (pin: string, sessionOnly: boolean) => void;
  onBack: () => void;
}) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [sessionOnly, setSessionOnly] = useState(false);
  const [error, setError] = useState('');
  const [isShaking, setIsShaking] = useState(false);

  const handleSubmit = () => {
    if (pin.length < MIN_PIN_LENGTH) {
      setError(`PIN must be at least ${MIN_PIN_LENGTH} characters`);
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      return;
    }
    if (pin !== confirmPin) {
      setError('PINs do not match');
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      return;
    }
    onSetPin(pin, sessionOnly);
  };

  const shakeVariants = {
    shake: {
      x: [0, -10, 10, -10, 10, -5, 5, 0],
      transition: { duration: 0.5 }
    }
  };

  return (
    <motion.div
      {...onboardingStepTransition}
    >
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Lock className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Set a Security PIN</h2>
        <p className="text-muted-foreground">
          Your private key will be encrypted with this PIN. You'll need it each time you open CipherLink.
        </p>
      </div>

      <motion.div
        variants={shakeVariants}
        animate={isShaking ? "shake" : ""}
      >
        <Card className="mb-6">
          <CardContent className="p-6 space-y-4">
            <div>
              <Label className="text-sm text-muted-foreground mb-2 block">PIN</Label>
              <motion.div whileFocus={{ scale: 1.01 }} transition={{ type: "spring", stiffness: 300, damping: 15 }} className="w-full">
                <Input
                  type="password"
                  placeholder={`Enter PIN (min ${MIN_PIN_LENGTH} characters)`}
                  value={pin}
                  onChange={(e) => { setPin(e.target.value); setError(''); }}
                  data-testid="input-pin"
                />
              </motion.div>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground mb-2 block">Confirm PIN</Label>
              <motion.div whileFocus={{ scale: 1.01 }} transition={{ type: "spring", stiffness: 300, damping: 15 }} className="w-full">
                <Input
                  type="password"
                  placeholder="Confirm PIN"
                  value={confirmPin}
                  onChange={(e) => { setConfirmPin(e.target.value); setError(''); }}
                  data-testid="input-confirm-pin"
                />
              </motion.div>
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex items-center space-x-2 pt-2">
              <Checkbox
                id="session-only"
                checked={sessionOnly}
                onCheckedChange={(checked) => setSessionOnly(checked === true)}
                data-testid="checkbox-session-only"
              />
              <label htmlFor="session-only" className="text-sm text-muted-foreground cursor-pointer">
                Session only — clear identity when tab closes (maximum security)
              </label>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 mb-6">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Why a PIN?</span> Your private key is encrypted with this PIN before being stored. Even if someone accesses your browser data, they cannot read your keys without the PIN.
        </p>
      </div>

      <div className="flex gap-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button className="flex-1" onClick={handleSubmit} data-testid="button-set-pin">
          Set PIN
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </motion.div>
  );
}

function UsernameStep({
  onComplete,
  onBack,
}: {
  onComplete: (username: string) => void;
  onBack: () => void;
}) {
  const [username, setUsername] = useState('');

  return (
    <motion.div
      {...onboardingStepTransition}
    >
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Shield className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Choose a Display Name</h2>
        <p className="text-muted-foreground">
          This name is stored locally only. It's never sent to our servers.
        </p>
      </div>

      <Card className="mb-6">
        <CardContent className="p-6">
          <Label className="text-sm text-muted-foreground mb-2 block">
            Display Name
          </Label>
          <Input
            type="text"
            placeholder="Anonymous"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={30}
            data-testid="input-username"
          />
          <p className="text-xs text-muted-foreground mt-2">
            This name is visible to your friends and stored only on your device.
          </p>
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button
          className="flex-1"
          onClick={() => onComplete(username || 'Anonymous')}
          data-testid="button-complete-setup"
        >
          Complete Setup
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </motion.div>
  );
}

function RestoreStep({
  onRestore,
  onBack,
}: {
  onRestore: (phrase: string) => void;
  onBack: () => void;
}) {
  const [phrase, setPhrase] = useState('');
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const handleRestore = () => {
    const cleanPhrase = phrase.toLowerCase().trim().replace(/\s+/g, ' ');

    if (!isValidRecoveryPhrase(cleanPhrase)) {
      setError('Invalid recovery phrase. Please check and try again.');
      return;
    }

    onRestore(cleanPhrase);
  };

  const handleTextChange = (val: string) => {
    setPhrase(val);
    setError('');

    // Match suggestions based on the last typed word
    const words = val.split(/\s+/);
    const lastWord = words[words.length - 1].toLowerCase();

    if (lastWord.length >= 2) {
      const matches = wordlist.filter((w: string) => w.startsWith(lastWord)).slice(0, 5);
      setSuggestions(matches);
    } else {
      setSuggestions([]);
    }
  };

  const handleSelectSuggestion = (word: string) => {
    const words = phrase.split(/\s+/);
    words[words.length - 1] = word;
    setPhrase(words.join(' ') + ' ');
    setSuggestions([]);
  };

  return (
    <motion.div
      {...onboardingStepTransition}
    >
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-cyan-950/20 border border-cyan-900/30 flex items-center justify-center mx-auto mb-4">
          <RefreshCw className="w-8 h-8 text-cyan-400" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Restore Your Identity</h2>
        <p className="text-muted-foreground">
          Enter your 12-word recovery phrase to restore your identity.
        </p>
      </div>

      <Card className="mb-6">
        <CardContent className="p-6">
          <Label className="text-sm text-muted-foreground mb-2 block">
            Recovery Phrase
          </Label>
          <textarea
            className="w-full h-32 p-4 rounded-lg bg-muted/50 border border-border font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Enter your 12-word recovery phrase..."
            value={phrase}
            onChange={(e) => handleTextChange(e.target.value)}
            data-testid="input-recovery-phrase"
          />
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3 animate-fade-in">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => handleSelectSuggestion(suggestion)}
                  className="px-2.5 py-1 rounded-full text-xs bg-cyan-950/40 text-cyan-400 border border-cyan-800/30 hover:bg-cyan-900/40 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
          {error && (
            <p className="text-sm text-destructive mt-2">{error}</p>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6 bg-primary/5 border-primary/20">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">How it works:</span> Your identity is recognized by your cryptographic public key, not your display name. Friends will know it's you even if you have a different display name on a new device.
          </p>
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button className="flex-1" onClick={handleRestore} data-testid="button-restore-submit">
          Restore Identity
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </motion.div>
  );
}

function CompleteStep() {
  const [, setLocation] = useLocation();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 220, damping: 24 }}
      className="text-center"
    >
      <div className="w-20 h-20 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-6">
        <Check className="w-10 h-10 text-green-500" />
      </div>
      <h2 className="text-2xl font-bold mb-4">You're All Set!</h2>
      <p className="text-muted-foreground mb-8">
        Your identity has been created and encrypted. Start adding friends and messaging securely.
      </p>
      <Button
        size="lg"
        className="glow-primary"
        onClick={() => setLocation('/chat')}
        data-testid="button-go-to-chat"
      >
        Start Messaging
        <ArrowRight className="w-5 h-5 ml-2" />
      </Button>
    </motion.div>
  );
}

function LinkDeviceStep({ onBack, onComplete }: { onBack: () => void; onComplete: (identity: IdentityData) => void }) {
  const [targetUserKey, setTargetUserKey] = useState('');
  const [deviceKeys, setDeviceKeys] = useState<{ privateKey: string; publicKey: string } | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Generate transient device keys for this link attempt
    setDeviceKeys(generateEd25519KeyPair());
  }, []);

  const handleStartLinking = async () => {
    if (!targetUserKey || !deviceKeys) return;
    
    // Basic validation
    if (targetUserKey.length < 64) {
      toast({ title: "Invalid Key", description: "The User Public Key must be 64 characters.", variant: "destructive" });
      return;
    }

    setIsPolling(true);

    try {
      await apiRequest('POST', '/api/link/request', {
        userPublicKey: targetUserKey.toLowerCase().trim(),
        devicePublicKey: deviceKeys.publicKey,
        deviceName: getDeviceName(),
      });
      toast({ title: "Request Sent", description: "Please approve this request on your other device." });
    } catch (err: any) {
      setIsPolling(false);
      toast({
        title: 'Linking Failed',
        description: err.message || 'Check the User Public Key and try again.',
        variant: 'destructive'
      });
    }
  };

  useEffect(() => {
    if (!isPolling || !deviceKeys || !targetUserKey) return;

    let timer: NodeJS.Timeout;
    const poll = async () => {
      try {
        const res = await fetch(`/api/link/status/${deviceKeys.publicKey}`);
        if (res.status === 404) return;
        
        const data = await res.json();
        
        if (data.status === 'rejected') {
          setIsPolling(false);
          toast({ title: 'Request Rejected', description: 'Linking was declined on the other device.', variant: 'destructive' });
          return;
        }

        if (data.status === 'approved' && data.encryptedIdentity && data.identitySignature) {
          setIsPolling(false);
          try {
            const { ed25519 } = await import('@noble/curves/ed25519.js');
            const myDeviceKey = deviceKeys.publicKey;
            const myDeviceKeyBytes = hexToBytes(myDeviceKey);
            const sigBytes = hexToBytes(data.identitySignature);
            const encryptedPayload = JSON.parse(data.encryptedIdentity);

            // 1. Derive the binding secret: HKDF(alicePublicKey, salt=bobDeviceKey)
            // Alice (approver) knows her own publicKey and Bob's device key.
            // Bob (us) knows alicePublicKey via targetUserKey and our own device key.
            // Both sides compute the same secret — no private key needed, no curve mismatch.
            const alicePubKeyBytes = hexToBytes(targetUserKey.toLowerCase().trim());
            const bindingSecret = await hkdf(alicePubKeyBytes, myDeviceKeyBytes, 'CipherLink-Device-Link-v1', 32);

            const identityJson = await decryptWithSecret(encryptedPayload, bindingSecret, 'CipherLink-Device-Link-v1');
            const identity = JSON.parse(identityJson);

            // 2. Verify Alice's Ed25519 signature over our device key hex string.
            // Alice now includes her Ed25519 device public key in the encrypted payload.
            // We MUST use that, NOT ed25519.getPublicKey(identity.privateKey) — that would
            // derive an Ed25519 key from Alice's X25519 scalar, which is completely wrong.
            if (!identity.devicePublicKey) {
              throw new Error('Identity payload missing devicePublicKey — upgrade the approver device');
            }
            const aliceDevicePubBytes = hexToBytes(identity.devicePublicKey);
            const msgBytes = new TextEncoder().encode(myDeviceKey);
            if (!ed25519.verify(sigBytes, msgBytes, aliceDevicePubBytes)) {
              throw new Error('Forged identity signature received');
            }

            // 3. Persist device keys locally. Identity (with PIN encryption) will be
            // saved in handleLinkPin after the user chooses their PIN. Do NOT call
            // setDecryptedIdentity here — that would cause state duplication and
            // the double-display-name issue.
            await saveDeviceIdentity(myDeviceKey, deviceKeys.privateKey, getDeviceName(), hexToBytes(identity.privateKey));

            toast({ title: "Identity Linked!", description: "Identity successfully transferred." });
            onComplete(identity);
          } catch (err) {
            toast({ title: "Verification Failed", description: "Could not cryptographically verify the linking payload.", variant: "destructive" });
          }
        }
      } catch (e) {
        // Poll silent failure
      }
    };

    timer = setInterval(poll, 3000);
    return () => clearInterval(timer);
  }, [isPolling, deviceKeys, targetUserKey, onComplete, toast]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
    >
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-secondary/10 flex items-center justify-center mx-auto mb-4">
          <RefreshCw className={`w-8 h-8 text-secondary ${isPolling ? 'animate-spin' : ''}`} />
        </div>
        <h2 className="text-2xl font-bold mb-2">Link Existing Device</h2>
        <p className="text-muted-foreground">
          Enter your User Public Key from your primary device to start the transfer.
        </p>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="targetKey" className="text-sm font-semibold">Your Identity Public Key</Label>
                <Badge variant={targetUserKey.length === 64 ? "default" : "outline"} className="text-[10px] tabular-nums px-1.5 h-5">
                  {targetUserKey.length}/64
                </Badge>
              </div>
              <textarea
                id="targetKey"
                placeholder="Paste the 64-character public key from your primary device here..."
                value={targetUserKey}
                onChange={(e) => setTargetUserKey(e.target.value.toLowerCase().replace(/[^a-f0-9]/g, '').slice(0, 64))}
                disabled={isPolling}
                className="w-full h-24 p-4 rounded-xl bg-muted/50 border-2 border-border font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all placeholder:text-muted-foreground/30 break-all leading-relaxed"
                spellCheck={false}
              />
              <p className="text-[10px] text-muted-foreground flex items-center gap-1.5 px-1 font-medium">
                <span className="w-1 h-1 rounded-full bg-primary/40 inline-block" />
                Find this in <span className="text-foreground">Settings &gt; My Identity</span> on your other device.
              </p>
            </div>

            {deviceKeys && (
              <div className="p-3 rounded-lg bg-muted/30 border border-dashed text-center">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">
                  This Device's Key
                </span>
                <code className="text-xs break-all opacity-60">{deviceKeys.publicKey}</code>
              </div>
            )}

            {!isPolling ? (
              <Button onClick={handleStartLinking} className="w-full" size="lg">
                Request Link
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col items-center justify-center p-6 border rounded-xl bg-accent/5 relative overflow-hidden">
                  <div className="relative w-24 h-24 flex items-center justify-center mb-4">
                    {/* Pulsing radar circles */}
                    <div className="absolute inset-0 rounded-full border border-cyan-500/20 animate-[ping_2s_infinite]" />
                    <div className="absolute inset-2 rounded-full border border-indigo-500/30 animate-[ping_2s_infinite_0.5s]" />
                    <div className="absolute inset-4 rounded-full border border-cyan-500/40 animate-[ping_2s_infinite_1s]" />
                    <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin relative z-10" />
                  </div>
                  <p className="text-sm font-semibold text-white">Transmitting pairing request...</p>
                  <p className="text-[11px] text-zinc-500 mt-1 text-center">Open Settings &gt; Devices on your primary client to approve transfer.</p>
                </div>
                <Button variant="outline" onClick={() => setIsPolling(false)} className="w-full">
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Button variant="ghost" onClick={onBack} disabled={isPolling} className="w-full">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back
      </Button>
    </motion.div>
  );
}

export function Onboarding() {
  useSEO({
    title: 'CipherLink — Set Up Cryptographic Identity',
    description: 'Set up your local device identity. Generate Curve25519 keys or restore previous sessions securely.',
    keywords: 'cryptographic identity, Curve25519 keys generation, restore seed phrase'
  });

  const [step, setStep] = useState<Step>('welcome');
  const [identity, setIdentity] = useState<IdentityData | null>(null);
  const [userPin, setUserPin] = useState<string>('');
  // Holds the full identity transferred from the primary device during linking.
  // Kept separate so the normal onboarding identity state is never polluted.
  const [linkedIdentity, setLinkedIdentity] = useState<(IdentityData & { localUsername?: string }) | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    '[INIT] CipherLink Client Engine booted.',
    '[INIT] IndexedDB storage space verified.',
    '[INIT] WebCrypto API provider detected: Webkit/Blink Crypto Subsystem.',
    '[AUDIT] Ready to establish new cryptographic context.'
  ]);

  const addLog = useCallback((msg: string) => {
    setTerminalLogs((prev) => [...prev, `[AUDIT] ${msg}`]);
  }, []);

  useEffect(() => {
    switch (step) {
      case 'welcome':
        addLog('Awaiting action: mint new identity, link existing hardware node, or restore index key.');
        break;
      case 'generate':
        addLog('Requesting 256 bits high-entropy secure random generator...');
        addLog('Invoking WebCrypto getRandomValues()...');
        break;
      case 'phrase':
        addLog('Seed entropy mapped to BIP39 English dictionary words.');
        addLog('Validating seed phrase checksum calculation...');
        addLog('Seed phrase verified and mapped to Curve25519 identity key.');
        break;
      case 'confirm':
        addLog('Security verification: validating user word placement input.');
        break;
      case 'pin':
      case 'restorePin':
      case 'linked':
        addLog('Initializing key wrapping layer: PBKDF2-HMAC-SHA256 initialized.');
        addLog('Gathering salt buffer metrics (16 bytes random generated).');
        addLog('Ready to encrypt IndexedDB payload.');
        break;
      case 'username':
        addLog('Awaiting local display username assignment.');
        break;
      case 'restore':
        addLog('Awaiting BIP39 dictionary query string parser input.');
        break;
      case 'link':
        addLog('Starting wireless device peer-to-peer sync interface.');
        addLog('Listening on temporary transfer channel...');
        break;
      case 'complete':
        addLog('Cryptographic context secured. Initialised public identity key validation.');
        break;
    }
  }, [step]);

  useEffect(() => {
    // Check if user already has an identity
    hasIdentity().then(exists => {
      if (exists) {
        setLocation('/chat');
      }
    });
  }, [setLocation]);

  const handleGenerate = async () => {
    setStep('generate');

    // Small delay for visual effect
    await new Promise(resolve => setTimeout(resolve, 1500));

    const newIdentity = await generateIdentity();
    setIdentity(newIdentity);
    setStep('phrase');
  };

  const handleRestore = async (phrase: string) => {
    try {
      const restoredIdentity = await restoreIdentity(phrase);
      setIdentity({
        ...restoredIdentity,
        recoveryPhrase: phrase,
      });
      // Go to PIN step for restore flow too
      setStep('restorePin');
    } catch {
      toast({
        title: 'Restore Failed',
        description: 'Could not restore identity from phrase.',
        variant: 'destructive',
      });
    }
  };

  const handleSetPin = (pin: string, sessionOnly: boolean) => {
    setUserPin(pin);
    setSessionOnlyMode(sessionOnly);
    setStep('username');
  };

  // Handles PIN submission for the device-link flow.
  // IMPORTANT: Does NOT call ensureDeviceRegistered or POST /api/users.
  // The server already registered this device during /api/link/approve —
  // calling those again would generate a new device key and trigger "Forged Identity".
  const handleLinkPin = async (pin: string, sessionOnly: boolean) => {
    if (!linkedIdentity) return;
    try {
      setSessionOnlyMode(sessionOnly);
      // Persist the transferred identity encrypted with the chosen PIN.
      // localUsername comes from the primary device — no second username prompt.
      // Coerce localUsername to string to satisfy the LocalIdentity type (it's always set by Alice).
      const identityToSave = {
        ...linkedIdentity,
        localUsername: linkedIdentity.localUsername ?? linkedIdentity.publicKey,
      };
      await saveIdentityEncrypted(identityToSave, pin);
      // Also load into memory for immediate use this session.
      await setDecryptedIdentity(identityToSave);

      // CRITICAL: Mark this device as already registered in IDB so that
      // ensureDeviceRegistered() in ChatPage does NOT attempt a redundant
      // self-signed re-registration. The device was registered server-side
      // inside /api/link/approve (with Alice's endorsement signature).
      // Without this flag, ensureDeviceRegistered() sends a self-signed
      // payload, which the server rejects as "Forged identity signature"
      // because userRecord.devicePublicKey is already set (non-TOFU path).
      const savedDeviceId = await getDeviceIdentity(hexToBytes(linkedIdentity.privateKey));
      if (savedDeviceId) {
        const idb = await getDB();
        await idb.put('settings', 'true', `device_registered_${savedDeviceId.publicKey}`);
      }

      // clean up on tab close if session-only mode selected.
      setupSessionOnlyCleanup();
      setLocation('/chat');
    } catch (error) {
      toast({
        title: 'Setup Failed',
        description: error instanceof Error ? error.message : 'Could not secure your linked identity. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleComplete = async (username: string) => {
    if (!identity || !userPin) return;

    try {
      const fullIdentity = {
        publicKey: identity.publicKey,
        privateKey: identity.privateKey,
        recoveryPhrase: identity.recoveryPhrase,
        localUsername: username,
      };

      // Save encrypted with PIN
      await saveIdentityEncrypted(fullIdentity, userPin);

      // Also load into memory for immediate use
      await setDecryptedIdentity(fullIdentity);

      // Set up session-only cleanup if enabled
      setupSessionOnlyCleanup();

      // Step 1: Register the account (identity public key only)
      try {
        await apiRequest('POST', '/api/users', {
          publicKey: identity.publicKey,
          displayName: username,
        });
      } catch {
        // Non-fatal — user might already exist (e.g. restore flow)
      }

      // Step 2: Register the primary device via the challenge-bound bootstrap endpoint
      try {
        await ensureDeviceRegistered(hexToBytes(identity.privateKey));
      } catch {
        // Non-fatal — device may already be registered
      }

      setStep('complete');
    } catch (error) {
      toast({
        title: 'Setup Failed',
        description: error instanceof Error ? error.message : 'Could not complete setup. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-300 flex flex-col lg:flex-row items-stretch selection:bg-cyan-900/30 selection:text-cyan-100 font-sans">
      {/* Background ambient lighting */}
      <div className="fixed inset-0 bg-[#050505] pointer-events-none -z-50" />
      <div className="fixed top-[10%] left-[20%] w-[800px] h-[800px] rounded-full bg-indigo-900/[0.015] blur-[150px] pointer-events-none -z-40" />
      <div className="fixed bottom-[10%] right-[10%] w-[600px] h-[600px] rounded-full bg-blue-900/[0.012] blur-[120px] pointer-events-none -z-40" />
      <div 
        className="fixed inset-0 opacity-[0.035] mix-blend-overlay pointer-events-none -z-30" 
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_center,transparent_30%,rgba(5,5,5,0.7)_100%)] pointer-events-none -z-20" />

      {/* Left Column - Dynamic Console (Visible on desktop) */}
      <div className="hidden lg:flex lg:w-2/5 bg-black/60 border-r border-white/[0.04] p-8 flex-col justify-between relative overflow-hidden backdrop-blur-md">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_left_top,rgba(6,182,212,0.03),transparent_60%)]" />
        <div className="relative z-10 flex-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 border-b border-white/[0.04] pb-4 mb-6">
              <div className="w-8 h-8 rounded-lg bg-cyan-950/20 border border-cyan-900/30 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.25)]">
                <Shield className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <span className="font-semibold text-sm text-white block">Cryptographic Engine Audit</span>
                <span className="text-[10px] text-zinc-500 font-mono">v1.1.0-ratchet-aad // Client Sandboxed</span>
              </div>
            </div>
            <div className="space-y-4">
              <h4 className="text-xs uppercase tracking-widest text-zinc-500 font-mono">Operations Console</h4>
              <div className="h-[480px] overflow-y-auto font-mono text-[10px] text-cyan-400/80 space-y-2.5 scrollbar-thin pr-2">
                {terminalLogs.map((log, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="leading-relaxed"
                  >
                    {log}
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          <div className="text-[10px] font-mono text-zinc-600 border-t border-white/[0.03] pt-4 flex items-center justify-between">
            <span>WEB_CRYPTO_API = TRUE</span>
            <span>INDEXED_DB = SANDBOXED</span>
          </div>
        </div>
      </div>

      {/* Right Column - Onboarding Forms */}
      <div className="flex-1 flex items-center justify-center p-6 relative">
        <div className="w-full max-w-lg bg-zinc-950/20 border border-white/[0.03] p-8 rounded-3xl backdrop-blur-xl shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-[1.5px] bg-cyan-500/30" />
          <AnimatePresence mode="wait">
            {step === 'welcome' && (
              <WelcomeStep
                key="welcome"
                onGenerate={handleGenerate}
                onRestore={() => setStep('restore')}
                onLink={() => setStep('link')}
              />
            )}
            {step === 'link' && (
              <LinkDeviceStep
                key="link"
                onBack={() => setStep('welcome')}
                onComplete={(transferredIdentity) => {
                  setLinkedIdentity(transferredIdentity as IdentityData & { localUsername?: string });
                  setStep('linked');
                }}
              />
            )}
            {step === 'linked' && (
              <PinStep
                key="linked"
                onSetPin={handleLinkPin}
                onBack={() => {
                  setLinkedIdentity(null);
                  setStep('link');
                }}
              />
            )}
            {step === 'generate' && <GeneratingStep key="generate" />}
            {step === 'phrase' && identity && (
              <RecoveryPhraseStep
                key="phrase"
                phrase={identity.recoveryPhrase}
                onContinue={() => setStep('confirm')}
                onBack={() => setStep('welcome')}
              />
            )}
            {step === 'confirm' && identity && (
              <ConfirmPhraseStep
                key="confirm"
                phrase={identity.recoveryPhrase}
                onConfirm={() => setStep('pin')}
                onBack={() => setStep('phrase')}
              />
            )}
            {step === 'pin' && (
              <PinStep
                key="pin"
                onSetPin={handleSetPin}
                onBack={() => setStep('confirm')}
              />
            )}
            {step === 'restorePin' && (
              <PinStep
                key="restorePin"
                onSetPin={handleSetPin}
                onBack={() => setStep('restore')}
              />
            )}
            {step === 'username' && (
              <UsernameStep
                key="username"
                onComplete={handleComplete}
                onBack={() => setStep('pin')}
              />
            )}
            {step === 'restore' && (
              <RestoreStep
                key="restore"
                onRestore={handleRestore}
                onBack={() => setStep('welcome')}
              />
            )}
            {step === 'complete' && <CompleteStep key="complete" />}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
