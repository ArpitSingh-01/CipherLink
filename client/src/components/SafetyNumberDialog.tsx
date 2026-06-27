import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ShieldCheck, ShieldAlert, Copy, Check } from 'lucide-react';
import { computeSafetyNumber, hexToBytes } from '@/lib/crypto';
import type { LocalFriend } from '@shared/schema';

interface SafetyNumberDialogProps {
  localPublicKey: string;       // hex
  friend: LocalFriend;
  onVerified: (friendPublicKey: string) => void;
  trigger?: React.ReactNode;
}

export function SafetyNumberDialog({
  localPublicKey,
  friend,
  onVerified,
  trigger,
}: SafetyNumberDialogProps) {
  const [open, setOpen] = useState(false);
  const [safetyNumber, setSafetyNumber] = useState<{
    hex: string;
    display: string;
    bytes: Uint8Array;
  } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const isVerified = !!friend.verified;

  useEffect(() => {
    if (!open) return;
    setLoading(true);

    (async () => {
      try {
        const local = hexToBytes(localPublicKey);
        const remote = hexToBytes(friend.publicKey);
        const sn = await computeSafetyNumber(local, remote);
        setSafetyNumber(sn);

        // Generate QR code from the raw hex safety number
        const dataUrl = await QRCode.toDataURL(sn.hex, {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 220,
          color: {
            dark: '#ffffff',  // white dots (dark-mode friendly)
            light: '#00000000', // transparent background
          },
        });
        setQrDataUrl(dataUrl);
      } catch (err) {
        console.error('Safety number computation failed:', err);
        toast({
          title: 'Error',
          description: 'Could not compute safety number',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [open, localPublicKey, friend.publicKey]);

  const handleCopyHex = () => {
    if (!safetyNumber) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(safetyNumber.display);
    } else {
      const ta = document.createElement('textarea');
      ta.value = safetyNumber.display;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleMarkVerified = () => {
    onVerified(friend.publicKey);
    toast({
      title: isVerified ? 'Verification Removed' : 'Contact Verified ✓',
      description: isVerified
        ? `${friend.displayName} has been unverified.`
        : `${friend.displayName}'s identity has been verified. MITM attacks would change this number.`,
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="sm" className="gap-2">
            {isVerified ? (
              <ShieldCheck className="w-4 h-4 text-green-500" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-yellow-500" />
            )}
            {isVerified ? 'Verified' : 'Verify Identity'}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isVerified ? (
              <ShieldCheck className="w-5 h-5 text-green-500" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-yellow-500" />
            )}
            Safety Number
          </DialogTitle>
          <DialogDescription>
            Verify this number with <strong>{friend.displayName}</strong> in person or via another
            secure channel. If it matches, no MITM is present.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : safetyNumber ? (
          <div className="space-y-4 mt-2">
            {/* QR Code */}
            {qrDataUrl && (
              <div className="flex items-center justify-center rounded-xl bg-muted/40 p-4">
                <img
                  src={qrDataUrl}
                  alt="Safety number QR code"
                  className="w-[180px] h-[180px] rounded-lg"
                />
              </div>
            )}

            {/* Human-readable groups */}
            <div className="rounded-xl bg-muted/50 border border-border p-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-3 text-center">
                Safety Number
              </p>
              <div className="grid grid-cols-4 gap-2">
                {safetyNumber.display.split(' ').map((group, i) => (
                  <div
                    key={i}
                    className="text-center font-mono text-sm font-semibold tracking-wider bg-background rounded-lg py-1.5 px-1"
                  >
                    {group}
                  </div>
                ))}
              </div>
            </div>

            {/* Copy button */}
            <Button variant="outline" size="sm" className="w-full gap-2" onClick={handleCopyHex}>
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-green-500" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy Safety Number
                </>
              )}
            </Button>

            {/* Verification status */}
            {isVerified && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <ShieldCheck className="w-4 h-4 text-green-500 flex-shrink-0" />
                <p className="text-sm text-green-400">
                  You have verified this contact's identity.
                </p>
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter className="flex flex-col gap-2 sm:flex-col">
          <Button
            onClick={handleMarkVerified}
            disabled={loading || !safetyNumber}
            variant={isVerified ? 'outline' : 'default'}
            className={isVerified ? '' : 'glow-primary'}
          >
            {isVerified ? 'Remove Verification' : 'Mark as Verified'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
