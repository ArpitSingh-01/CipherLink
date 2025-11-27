import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { generateIdentity, restoreIdentity, isValidRecoveryPhrase } from '@/lib/crypto';
import { saveIdentity, hasIdentity } from '@/lib/storage';
import { Shield, KeyRound, Copy, Check, ArrowRight, ArrowLeft, AlertTriangle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type Step = 'welcome' | 'generate' | 'phrase' | 'confirm' | 'username' | 'restore' | 'complete';

interface IdentityData {
  privateKey: string;
  publicKey: string;
  recoveryPhrase: string;
}

function WelcomeStep({ onGenerate, onRestore }: { onGenerate: () => void; onRestore: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="text-center"
    >
      <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6 glow-primary">
        <Shield className="w-10 h-10 text-primary" />
      </div>
      <h1 className="text-3xl font-bold mb-4">Welcome to CipherLink</h1>
      <p className="text-muted-foreground mb-8 max-w-md mx-auto">
        Your identity is a cryptographic key pair. No emails, no passwords, no phone numbers. Just pure cryptographic privacy.
      </p>
      
      <div className="flex flex-col gap-4 max-w-xs mx-auto">
        <Button size="lg" onClick={onGenerate} className="glow-primary" data-testid="button-create-identity">
          <KeyRound className="w-5 h-5 mr-2" />
          Create New Identity
        </Button>
        <Button size="lg" variant="outline" onClick={onRestore} data-testid="button-restore-identity">
          <RefreshCw className="w-5 h-5 mr-2" />
          Restore from Phrase
        </Button>
      </div>
    </motion.div>
  );
}

function GeneratingStep() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
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
    navigator.clipboard.writeText(phrase);
    setCopied(true);
    toast({ title: 'Recovery phrase copied', description: 'Store it somewhere safe!' });
    setTimeout(() => setCopied(false), 3000);
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
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
          <div className="grid grid-cols-3 gap-3 mb-6">
            {words.map((word, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 font-mono text-sm animate-reveal"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <span className="text-muted-foreground text-xs w-5">{index + 1}.</span>
                <span data-testid={`text-word-${index + 1}`}>{word}</span>
              </div>
            ))}
          </div>
          
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
    const indices: number[] = [];
    while (indices.length < 3) {
      const idx = Math.floor(Math.random() * 12);
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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
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
  
  const handleRestore = () => {
    const cleanPhrase = phrase.toLowerCase().trim().replace(/\s+/g, ' ');
    
    if (!isValidRecoveryPhrase(cleanPhrase)) {
      setError('Invalid recovery phrase. Please check and try again.');
      return;
    }
    
    onRestore(cleanPhrase);
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <RefreshCw className="w-8 h-8 text-primary" />
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
            onChange={(e) => {
              setPhrase(e.target.value);
              setError('');
            }}
            data-testid="input-recovery-phrase"
          />
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
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="text-center"
    >
      <div className="w-20 h-20 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-6">
        <Check className="w-10 h-10 text-green-500" />
      </div>
      <h2 className="text-2xl font-bold mb-4">You're All Set!</h2>
      <p className="text-muted-foreground mb-8">
        Your identity has been created. Start adding friends and messaging securely.
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

export function Onboarding() {
  const [step, setStep] = useState<Step>('welcome');
  const [identity, setIdentity] = useState<IdentityData | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
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
    
    const newIdentity = generateIdentity();
    setIdentity(newIdentity);
    setStep('phrase');
  };
  
  const handleRestore = async (phrase: string) => {
    try {
      const restoredIdentity = restoreIdentity(phrase);
      setIdentity({
        ...restoredIdentity,
        recoveryPhrase: phrase,
      });
      setStep('username');
    } catch (error) {
      toast({
        title: 'Restore Failed',
        description: 'Could not restore identity from phrase.',
        variant: 'destructive',
      });
    }
  };
  
  const handleComplete = async (username: string) => {
    if (!identity) return;
    
    try {
      await saveIdentity({
        publicKey: identity.publicKey,
        privateKey: identity.privateKey,
        recoveryPhrase: identity.recoveryPhrase,
        localUsername: username,
      });
      
      // Register public key with server
      await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey: identity.publicKey }),
      });
      
      setStep('complete');
    } catch (error) {
      toast({
        title: 'Setup Failed',
        description: 'Could not complete setup. Please try again.',
        variant: 'destructive',
      });
    }
  };
  
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <AnimatePresence mode="wait">
          {step === 'welcome' && (
            <WelcomeStep
              key="welcome"
              onGenerate={handleGenerate}
              onRestore={() => setStep('restore')}
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
              onConfirm={() => setStep('username')}
              onBack={() => setStep('phrase')}
            />
          )}
          {step === 'username' && (
            <UsernameStep
              key="username"
              onComplete={handleComplete}
              onBack={() => setStep('confirm')}
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
  );
}
