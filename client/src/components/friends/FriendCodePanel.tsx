/**
 * FriendCodePanel component for creating and redeeming friend codes.
 *
 * Implements code generation/viewing and code entry/redemption tabs.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QrCode, UserPlus, Check, Copy } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface FriendCodePanelProps {
  onCodeCreated: () => Promise<void>;
  onCodeRedeemed: (code: string, name: string) => Promise<void>;
  isGenerating: boolean;
  isRedeeming: boolean;
  generatedCode?: string | null;
  expiresAt?: Date | null;
}

export function FriendCodePanel({
  onCodeCreated,
  onCodeRedeemed,
  isGenerating,
  isRedeeming,
  generatedCode,
  expiresAt,
}: FriendCodePanelProps) {
  const [mode, setMode] = useState<'generate' | 'enter'>('generate');
  const [enteredCode, setEnteredCode] = useState('');
  const [friendName, setFriendName] = useState('');
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    if (generatedCode) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(generatedCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = generatedCode;
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          setCopied(true);
          setTimeout(() => setCopied(false), 3000);
        } catch {
          // Silent catch for clipboard issues
        }
        document.body.removeChild(textArea);
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 mb-4">
        <Button
          variant={mode === 'generate' ? 'default' : 'outline'}
          className="flex-1"
          onClick={() => setMode('generate')}
        >
          <QrCode className="w-4 h-4 mr-2" />
          Share Code
        </Button>
        <Button
          variant={mode === 'enter' ? 'default' : 'outline'}
          className="flex-1"
          onClick={() => setMode('enter')}
        >
          <UserPlus className="w-4 h-4 mr-2" />
          Enter Code
        </Button>
      </div>

      {mode === 'generate' ? (
        <div className="space-y-4">
          {generatedCode ? (
            <>
              <div className="p-6 rounded-xl bg-muted/50 text-center">
                <p className="text-3xl font-mono font-bold tracking-widest mb-2" data-testid="text-friend-code">
                  {generatedCode.split('').map((char, i) => (
                    <span key={i} className="animate-reveal inline-block" style={{ animationDelay: `${i * 0.05}s` }}>
                      {char}
                    </span>
                  ))}
                </p>
                {expiresAt && (
                  <p className="text-sm text-muted-foreground">
                    Expires in {formatDistanceToNow(expiresAt)}
                  </p>
                )}
              </div>
              <Button className="w-full" onClick={copyCode}>
                {copied ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Code
                  </>
                )}
              </Button>
            </>
          ) : (
            <Button
              className="w-full"
              onClick={onCodeCreated}
              disabled={isGenerating}
              data-testid="button-generate-code"
            >
              {isGenerating ? 'Generating...' : 'Generate Friend Code'}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Friend Code</label>
            <Input
              placeholder="Enter 8-character code"
              value={enteredCode}
              onChange={(e) => setEnteredCode(e.target.value.toUpperCase())}
              maxLength={8}
              className="font-mono text-center text-lg tracking-widest"
              data-testid="input-friend-code"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Friend's Name (optional)</label>
            <Input
              placeholder="What should we call them?"
              value={friendName}
              onChange={(e) => setFriendName(e.target.value)}
              data-testid="input-friend-name"
            />
          </div>
          <Button
            className="w-full"
            onClick={() => onCodeRedeemed(enteredCode, friendName)}
            disabled={enteredCode.length !== 8 || isRedeeming}
            data-testid="button-redeem-code"
          >
            {isRedeeming ? 'Adding...' : 'Add Friend'}
          </Button>
        </div>
      )}
    </div>
  );
}
