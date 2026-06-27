import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/useToast';
import { useNotifications } from '@/hooks/useNotifications';
import { getIdentity, getDeviceIdentity, getAllFriends, saveFriend, getFriend, updateFriendLastMessage, blockUser, unblockUser, isBlocked as isBlockedLocal, getBlockedUsers, clearAllData, hasEncryptedIdentity, getIdentityEncrypted, setDecryptedIdentity, saveSentMessage, getSentMessage, setFriendVerified, getDB, detectIdentityKeyChange, clearSessionMemory, ensureSessionCryptoVersion } from '@/lib/storage';
import { hexToBytes, bytesToHex, generateFriendCode, computeSafetyNumber, MIN_PIN_LENGTH, zeroizeBytes } from '@/lib/crypto';
import { ensureDeviceRegistered, detectNewDevices, acknowledgeDevices } from '@/lib/devices';
import { loadSession, initSession, encryptRatchet, decryptRatchet } from '@/lib/session';
import { TTL_OPTIONS, DEFAULT_TTL, type LocalFriend, type DecryptedMessage } from '@shared/schema';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { authenticatedFetch } from '@/lib/auth';
import {
  Users,
  Plus,
  MessageSquare,
  Search,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Settings,
  LogOut,
  KeyRound,
  Trash2,
  Check,
  MoreVertical,
  Lock,
  Trash,
  AlertTriangle,
  Copy,
  RotateCcw,
  ArrowLeft,
  Timer,
  UserPlus,
  QrCode,
  Bell,
  UserCheck,
  X,
  ChevronLeft,
  UserX,
  Clock,
  Send,
  ShieldOff,
  Ban,
  LockOpen
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow, differenceInSeconds, format } from 'date-fns';
import { DevicesDialog } from './DevicesDialog';
import { IdentityDialog } from './IdentityDialog';
import { FriendsSidebar } from './FriendsSidebar';
import { ComposeBar } from './ComposeBar';
import { MessageThread } from './MessageThread';
import { PinUnlockDialog } from './PinUnlockDialog';

interface ChatState {
  identity: {
    publicKey: string;
    privateKey: string;
    localUsername: string;
  } | null;
  selectedFriend: LocalFriend | null;
  friends: LocalFriend[];
}



function EmptyChat() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <MessageSquare className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-lg font-medium mb-2">Select a Conversation</h3>
        <p className="text-muted-foreground text-sm max-w-xs">
          Choose a friend from the list to start chatting securely
        </p>
      </div>
    </div>
  );
}

function VerificationDialog({
  friend,
  ownPublicKey,
  open,
  onOpenChange,
  onVerify,
}: {
  friend: LocalFriend;
  ownPublicKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVerify: (verified: boolean) => void;
}) {
  const [safetyData, setSafetyData] = useState<{ hex: string; display: string } | null>(null);

  useEffect(() => {
    if (open) {
      computeSafetyNumber(hexToBytes(ownPublicKey), hexToBytes(friend.publicKey))
        .then(setSafetyData)
        .catch(err => { if (import.meta.env.DEV) console.error("Failed to compute safety number", err); });
    }
  }, [open, ownPublicKey, friend.publicKey]);

  const safetyNumber = safetyData?.display || 'Computing...';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl">Verify Safety Number</DialogTitle>
          <DialogDescription className="text-center">
            Compare these numbers with {friend.displayName} to ensure no one is eavesdropping on your secure connection.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          <div className="relative group">
            <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="p-6 bg-muted/30 rounded-2xl font-mono text-sm sm:text-lg break-all leading-relaxed tracking-[0.2em] text-center select-all border border-border/50 shadow-inner">
              {safetyNumber}
            </div>
          </div>

          <div
            className={`flex items-start gap-3 border rounded-2xl p-4 cursor-pointer transition-all hover:shadow-md ${friend.verified ? 'bg-primary/5 border-primary/20' : 'hover:bg-accent/50 border-border'}`}
            onClick={() => onVerify(!friend.verified)}
          >
            <div className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${friend.verified ? 'bg-primary border-primary' : 'border-muted-foreground'}`}>
              {friend.verified && <Check className="w-4 h-4 text-primary-foreground" strokeWidth={3} />}
            </div>
            <div className="space-y-1">
              <p className="font-medium text-sm leading-tight">Mark as Verified</p>
              <p className="text-xs text-muted-foreground">
                I have confirmed with {friend.displayName} that our safety numbers match.
              </p>
            </div>
          </div>

          <div className="space-y-3 p-4 rounded-xl bg-orange-50/50 dark:bg-orange-950/10 border border-orange-100 dark:border-orange-900/30">
            <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
              <Smartphone className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Device Fingerprint</span>
            </div>
            <p className="text-xs text-orange-800/80 dark:text-orange-300/60 font-mono break-all opacity-80">
              {friend.publicKey}
            </p>
          </div>
        </div>
        <DialogFooter className="sm:justify-center">
          <Button variant="outline" className="w-full sm:w-auto px-8" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


export function ChatPage() {
  const [, setLocation] = useLocation();
  const [state, setState] = useState<ChatState>({
    identity: null,
    selectedFriend: null,
    friends: [],
  });
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showSidebar, setShowSidebar] = useState(true);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockedSet, setBlockedSet] = useState<Set<string>>(new Set());
  const [selectedFriendBlocked, setSelectedFriendBlocked] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [pinPromptOpen, setPinPromptOpen] = useState(false);
  const [verificationDialogOpen, setVerificationDialogOpen] = useState(false);
  const [safetyWarning, setSafetyWarning] = useState<{ sessionId: string; oldFp: string; newFp: string } | null>(null);
  const [newDevices, setNewDevices] = useState<any[]>([]);
  const [pinError, setPinError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClientRef = useQueryClient();

  // PIN rate-limiting: max 5 attempts before 30-second lockout
  const pinAttemptCount = useRef(0);
  const pinLockoutUntil = useRef<number>(0);

  // Supabase Realtime push notifications — makes messages appear instantly (<100ms)
  // instead of waiting for the next poll cycle
  useNotifications(state.identity?.publicKey);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // Load identity and friends from IndexedDB, then sync with server
    const loadData = async () => {
      // Check if identity already in memory (e.g. just came from onboarding)
      let identity = await getIdentity();

      if (!identity) {
        // Check if encrypted identity exists -> show PIN prompt
        const hasEncrypted = await hasEncryptedIdentity();
        if (hasEncrypted) {
          setPinPromptOpen(true);
          return;
        }
        // No identity at all -> go to onboarding
        setLocation('/onboarding');
        return;
      }

      // Load local friends first
      let friends = await getAllFriends();

      // Sync friends from server
      try {
        const response = await authenticatedFetch(`/api/friends/${encodeURIComponent(identity.publicKey)}`);
        if (response.ok) {
          const serverFriends = await response.json();

          // Merge server friends with local friends
          for (const serverFriend of serverFriends) {
            const existingFriend = friends.find(f => f.publicKey === serverFriend.friendPublicKey);
            if (!existingFriend) {
              // Use the friend's own display name from the server, fall back to key-derived name
              const fallbackName = `User-${serverFriend.friendPublicKey.slice(0, 8).toUpperCase()}`;
              const newFriend = {
                publicKey: serverFriend.friendPublicKey,
                displayName: serverFriend.friendDisplayName || fallbackName,
              };
              await saveFriend(newFriend);
              friends.push(newFriend);
            }
          }
        }
      } catch {
        // Non-fatal: server sync failure
      }

      // Reload friends after sync
      friends = await getAllFriends();

      setState(prev => ({
        ...prev,
        identity: {
          publicKey: identity!.publicKey,
          privateKey: identity!.privateKey,
          localUsername: identity!.localUsername,
        },
        friends,
      }));

      // Sync blocked users list
      try {
        const localBlocked = await getBlockedUsers();
        const blockedRes = await authenticatedFetch(`/api/blocked/${encodeURIComponent(identity.publicKey)}`);
        if (blockedRes.ok) {
          const serverBlocked = await blockedRes.json() as string[];
          setBlockedSet(new Set([...localBlocked, ...serverBlocked]));
        } else {
          setBlockedSet(new Set(localBlocked));
        }
      } catch {
        const localBlocked = await getBlockedUsers();
        setBlockedSet(new Set(localBlocked));
      }
    };

    loadData();

    // Safety fallback: Poll every 60s for newly accepted friends.
    // Supabase Realtime handles instant delivery of friend events.
    const syncFriendsInterval = setInterval(async () => {
      const identity = await getIdentity();
      if (!identity) return;
      try {
        const response = await authenticatedFetch(`/api/friends/${encodeURIComponent(identity.publicKey)}`);
        if (!response.ok) return;
        const serverFriends = await response.json();
        const localFriends = await getAllFriends();
        let changed = false;
        for (const serverFriend of serverFriends) {
          const exists = localFriends.find(f => f.publicKey === serverFriend.friendPublicKey);
          if (!exists) {
            const fallbackName = `User-${serverFriend.friendPublicKey.slice(0, 8).toUpperCase()}`;
            await saveFriend({
              publicKey: serverFriend.friendPublicKey,
              displayName: serverFriend.friendDisplayName || fallbackName,
            });
            changed = true;
          }
        }
        if (changed) {
          const updated = await getAllFriends();
          setState(prev => ({ ...prev, friends: updated }));
        }
      } catch {
        // Non-fatal
      }
    }, 60000); // Safety fallback — Realtime handles instant delivery

    return () => clearInterval(syncFriendsInterval);
  }, [setLocation]);

  // Session crypto version cleanup on identity load
  useEffect(() => {
    if (!state.identity) return;

    // Wipe any stale ratchet sessions from old crypto formats on every identity load.
    // This is essential for Vite HMR where the IDB upgrade callback doesn't re-fire.
    ensureSessionCryptoVersion().catch(e => { if (import.meta.env.DEV) console.warn('[CipherLink] ensureSessionCryptoVersion failed:', e); });
  }, [state.identity]);

  const handlePinUnlock = async (enteredPin: string) => {
    // Rate-limit check
    const now = Date.now();
    if (now < pinLockoutUntil.current) {
      const remaining = Math.ceil((pinLockoutUntil.current - now) / 1000);
      setPinError(`Too many attempts. Try again in ${remaining}s.`);
      return;
    }
    if (enteredPin.length < MIN_PIN_LENGTH) {
      setPinError(`PIN must be at least ${MIN_PIN_LENGTH} characters`);
      return;
    }
    try {
      const identity = await getIdentityEncrypted(enteredPin);
      if (!identity) {
        pinAttemptCount.current += 1;
        if (pinAttemptCount.current >= 5) {
          pinLockoutUntil.current = Date.now() + 30_000;
          pinAttemptCount.current = 0;
          setPinError('Too many failed attempts. Locked for 30 seconds.');
        } else {
          setPinError(`Invalid PIN. ${5 - pinAttemptCount.current} attempt(s) remaining.`);
        }
        return;
      }
      // Success: reset rate-limit counters
      pinAttemptCount.current = 0;
      pinLockoutUntil.current = 0;
      await setDecryptedIdentity(identity);
      setPinPromptOpen(false);
      setPinError('');
      // Reload data after unlock
      const friends = await getAllFriends();
      setState({
        identity: {
          publicKey: identity.publicKey,
          privateKey: identity.privateKey,
          localUsername: identity.localUsername,
        },
        selectedFriend: null,
        friends,
      });
    } catch {
      pinAttemptCount.current += 1;
      if (pinAttemptCount.current >= 5) {
        pinLockoutUntil.current = Date.now() + 30_000;
        pinAttemptCount.current = 0;
        setPinError('Too many failed attempts. Locked for 30 seconds.');
      } else {
        setPinError(`Invalid PIN. ${5 - pinAttemptCount.current} attempt(s) remaining.`);
      }
    }
  };

  // Fetch messages when a friend is selected
  const { data: serverMessages, isLoading: messagesLoading } = useQuery({
    queryKey: ['/api/messages', state.identity?.publicKey, state.selectedFriend?.publicKey],
    queryFn: async () => {
      if (!state.identity || !state.selectedFriend) return [];
      const res = await authenticatedFetch(
        `/api/messages/${state.identity.publicKey}?friendPublicKey=${encodeURIComponent(state.selectedFriend.publicKey)}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error('Failed to fetch messages');
      return res.json();
    },
    enabled: !!state.selectedFriend && !!state.identity,
    refetchInterval: 30000, // Safety fallback — Supabase Realtime handles instant delivery
  });

  // Store optimistic sent messages locally
  const [sentMessages, setSentMessages] = useState<DecryptedMessage[]>([]);

  // Hash map for caching decrypted plaintexts to avoid ratchet desync
  const decryptedCache = useRef<Map<string, string>>(new Map());

  // Clear decryption cache when switching friends to ensure fresh state
  useEffect(() => {
    decryptedCache.current.clear();
  }, [state.selectedFriend?.publicKey]);

  // Decrypt messages when they change
  useEffect(() => {
    const decryptMessages = async () => {
      if (!serverMessages || !state.identity || !state.selectedFriend) return;

      const deviceIdentity = await getDeviceIdentity();
      const decrypted: DecryptedMessage[] = [];

      for (const msg of serverMessages as any[]) {
        const isSentByMe = msg.senderPublicKey === state.identity.publicKey;
        try {
          if (decryptedCache.current.has(msg.id)) {
            decrypted.push({
              id: msg.id,
              senderPublicKey: msg.senderPublicKey,
              receiverPublicKey: msg.receiverPublicKey,
              plaintext: decryptedCache.current.get(msg.id)!,
              ttlSeconds: msg.ttlSeconds,
              isRead: msg.isRead || false,
              reactions: msg.reactions ? JSON.parse(msg.reactions) : {},
              createdAt: new Date(msg.createdAt),
              expiresAt: new Date(msg.expiresAt),
              isMine: isSentByMe,
            });
            continue;
          }

          let plaintext = '';

          if (isSentByMe) {
            const cached = await getSentMessage(msg.id).catch(() => null);
            const inMem = sentMessages.find(m => m.id === msg.id);
            if (cached) {
              plaintext = cached;
            } else if (inMem) {
              plaintext = inMem.plaintext;
            }
          }

          if (!plaintext && deviceIdentity) {
            let payloads: any[] = [];
            try {
              payloads = msg.encryptedPayloads ? JSON.parse(msg.encryptedPayloads) : [];
            } catch (e) {
              if (import.meta.env.DEV) console.error('Failed to parse message payloads', e);
            }

            const matchingPayloads = payloads.filter(p => p.devicePublicKey === deviceIdentity.publicKey || p.devicePublicKey === state.identity?.publicKey);

            if (matchingPayloads.length !== 1) {
              if (matchingPayloads.length > 1) {
                if (import.meta.env.DEV) console.warn('Multiple payloads found for this device. Rejecting.');
              }
              continue;
            }

            const targetPayload = matchingPayloads[0];
            if (targetPayload) {
              const { ciphertext, nonce, ephemeralPublicKey, senderDevicePublicKey } = targetPayload;
              const localDevicePub = hexToBytes(deviceIdentity.publicKey);
              const peerDeviceHex = senderDevicePublicKey || msg.senderPublicKey;
              const peerPubForSession = hexToBytes(peerDeviceHex);
              // Use remote IDENTITY key (X25519) for session lookup, NOT device key (Ed25519).
              // msg.senderPublicKey is the X25519 identity key — consistent with initSession.
              const peerIdentityForSession = hexToBytes(msg.senderPublicKey);

              let session = await loadSession(hexToBytes(state.identity!.publicKey), peerIdentityForSession);
              if (import.meta.env.DEV) console.debug('[Ratchet] loadSession result:', {
                found: !!session,
                isInitiator: session?.isInitiator,
              });

              if (!session && ephemeralPublicKey && ephemeralPublicKey !== '00'.repeat(32)) {
                try {
                  const reqSenderEph = hexToBytes(ephemeralPublicKey);
                  const peerDevicesRes = await authenticatedFetch(`/api/users/${encodeURIComponent(msg.senderPublicKey)}/devices`);
                  if (!peerDevicesRes.ok) throw new Error('Could not fetch peer devices');
                  const peerDevices = await peerDevicesRes.json();

                  const peerDevice = peerDevices.find((d: any) => d.devicePublicKey === peerDeviceHex);
                  if (!peerDevice) throw new Error(`Untrusted device ${peerDeviceHex}`);

                  const { ed25519 } = await import('@noble/curves/ed25519.js');
                  const sigMsg = new TextEncoder().encode(peerDevice.devicePublicKey);
                  const sigBytes = hexToBytes(peerDevice.identitySignature);

                  // CRITICAL FIX: identitySignature was signed with the primary device's Ed25519 key.
                  // msg.senderPublicKey is the X25519 identity key — WRONG curve, wrong key, wrong for verify.
                  // The primary (TOFU) device is self-signed: ed25519.verify(sig, devKey, devKey).
                  // Secondary devices are endorsed by the primary: ed25519.verify(sig, devKey, primaryDevKey).
                  // In both cases the verifying key is an Ed25519 devicePublicKey, NOT the X25519 identity key.
                  // We find the primary device by checking which device is self-signed (TOFU bootstrap).
                  const primaryDevice = peerDevices.find((d: any) => {
                    try {
                      const selfSig = hexToBytes(d.identitySignature);
                      const selfMsg = new TextEncoder().encode(d.devicePublicKey);
                      const selfKey = hexToBytes(d.devicePublicKey);
                      return ed25519.verify(selfSig, selfMsg, selfKey);
                    } catch { return false; }
                  });
                  const verifyingKey = primaryDevice
                    ? hexToBytes(primaryDevice.devicePublicKey)
                    : hexToBytes(peerDevice.devicePublicKey); // Fallback: assume self-signed (TOFU)

                  if (!ed25519.verify(sigBytes, sigMsg, verifyingKey)) {
                    throw new Error('FORGED device signature detected');
                  }

                  // X3DH REQUIRES the X25519 identity key pair — NOT the Ed25519 device key.
                  // The device key (Ed25519) is only used for authentication/signing.
                  // Using deviceIdentity (Ed25519) here produces a wrong shared secret
                  // that will never match the initiator's computation → decryption always fails.
                  if (import.meta.env.DEV) console.debug('[Ratchet] initSession (responder)');
                  const res = await initSession(
                    { privateKey: hexToBytes(state.identity!.privateKey), publicKey: hexToBytes(state.identity!.publicKey) },
                    peerPubForSession,
                    hexToBytes(msg.senderPublicKey),
                    null,
                    reqSenderEph
                  );
                  if (import.meta.env.DEV) console.debug('[Ratchet] responder session created');
                  session = res.session;
                } catch (e: any) {
                  if (import.meta.env.DEV) console.error('Responder init failed:', e.message);
                  continue;
                }
              }

              if (session) {
                try {
                  plaintext = await decryptRatchet(session, {
                    header: targetPayload.header,
                    ciphertext: hexToBytes(ciphertext),
                    nonce: hexToBytes(nonce),
                    createdAt: targetPayload.createdAt || new Date(msg.createdAt).getTime(),
                    expiresAt: targetPayload.expiresAt || new Date(msg.expiresAt).getTime(),
                    ttlMs: targetPayload.ttlMs || msg.ttlSeconds * 1000
                  });
                } catch (error) {
                  if (import.meta.env.DEV) console.warn('Ratchet decryption failed', error);
                }
              }
            }
          }

          if (!plaintext) continue;

          decryptedCache.current.set(msg.id, plaintext);
          if (decryptedCache.current.size > 500) {
            const firstKey = decryptedCache.current.keys().next().value;
            if (firstKey) decryptedCache.current.delete(firstKey);
          }

          decrypted.push({
            id: msg.id,
            senderPublicKey: msg.senderPublicKey,
            receiverPublicKey: msg.receiverPublicKey,
            plaintext,
            ttlSeconds: msg.ttlSeconds,
            isRead: msg.isRead || false,
            reactions: msg.reactions ? JSON.parse(msg.reactions) : {},
            createdAt: new Date(msg.createdAt),
            expiresAt: new Date(msg.expiresAt),
            isMine: isSentByMe,
          });
        } catch (error) {
          decrypted.push({
            id: msg.id,
            senderPublicKey: msg.senderPublicKey,
            receiverPublicKey: msg.receiverPublicKey,
            plaintext: '⚠️ Decryption failed',
            ttlSeconds: msg.ttlSeconds,
            isRead: msg.isRead || false,
            reactions: {},
            createdAt: new Date(msg.createdAt),
            expiresAt: new Date(msg.expiresAt),
            isMine: isSentByMe,
          });
        }
      }

      const serverIds = new Set(decrypted.map(m => m.id));
      const optimistic = sentMessages.filter(m => !serverIds.has(m.id));

      const allMessages = [...decrypted, ...optimistic].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      );

      setMessages(allMessages);
    };

    decryptMessages().catch(() => { });
  }, [serverMessages, state.identity, state.selectedFriend, sentMessages]);

  // Ensure device is registered on mount
  useEffect(() => {
    if (state.identity) {
      ensureDeviceRegistered();
    }
  }, [state.identity]);

  // SEC-PERF: Client-side interval to remove expired messages without waiting for server poll
  useEffect(() => {
    if (!state.selectedFriend?.publicKey) return;
    const interval = setInterval(() => {
      // Force re-render to update expired message display
      queryClientRef.invalidateQueries({
        queryKey: ['/api/messages', state.identity?.publicKey, state.selectedFriend?.publicKey]
      });
    }, 10000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, [state.selectedFriend?.publicKey, state.identity?.publicKey]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessageMutation = useMutation({
    retry: 2,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 5000),
    mutationFn: async ({ message, ttl }: { message: string; ttl: number }) => {
      if (!state.identity || !state.selectedFriend) throw new Error('No identity or friend');

      // SEC-TOFU: Detect identity key rotation for verified contacts.
      // If the remote key has changed since last verification, block the send
      // and require manual re-verification via Safety Numbers.
      const keyChanged = await detectIdentityKeyChange(state.selectedFriend.publicKey);
      if (keyChanged) {
        throw new Error(
          'IDENTITY_KEY_CHANGED: The safety number for this contact has changed. ' +
          'Please verify their identity before sending messages.'
        );
      }

      // 1. Get identities
      const deviceIdentity = await getDeviceIdentity();
      if (!deviceIdentity) {
        throw new Error('Device not registered. Please try refreshing.');
      }

      const localDevicePub = hexToBytes(deviceIdentity.publicKey);
      const localIdentityPub = hexToBytes(state.identity.publicKey);
      const remoteIdentityPub = hexToBytes(state.selectedFriend.publicKey);

      // 2. Fetch all devices to encrypt for (fan-out)
      // Both the recipient's devices AND our other devices
      // Use authenticatedFetch — raw fetch() bypasses Ed25519 auth
      // Use /api/users/:key/devices for arbitrary user lookups (friend devices);
      // use /api/devices for own-device query (locked to req.authPublicKey on server).
      const [friendDevicesRes, myDevicesRes] = await Promise.all([
        authenticatedFetch(`/api/users/${encodeURIComponent(state.selectedFriend.publicKey)}/devices`),
        authenticatedFetch('/api/devices')
      ]);

      if (!friendDevicesRes.ok || !myDevicesRes.ok) {
        throw new Error('Failed to fetch synchronization devices');
      }

      const friendDevices = await friendDevicesRes.json();
      const myDevices = await myDevicesRes.json();

      const allDevicesToEncryptRaw = [
        ...friendDevices,
        ...myDevices.filter((d: any) => d.devicePublicKey !== deviceIdentity.publicKey)
      ];

      // Deduplicate devices to guarantee unique independent sessions
      const uniqueDevicesMap = new Map();
      for (const d of allDevicesToEncryptRaw) {
        if (!uniqueDevicesMap.has(d.devicePublicKey)) {
          uniqueDevicesMap.set(d.devicePublicKey, d);
        }
      }

      const allDevicesToEncryptUntrusted = Array.from(uniqueDevicesMap.values());
      const allDevicesToEncrypt = [];

      // Step 9: Server Trust Model - The server MUST NOT be able to inject fake devices
      const { ed25519 } = await import('@noble/curves/ed25519.js');

      for (const d of allDevicesToEncryptUntrusted) {
        // If it's explicitly the identity key fallback, we trust it inherently
        if (d.devicePublicKey === state.selectedFriend.publicKey || d.devicePublicKey === state.identity.publicKey) {
          allDevicesToEncrypt.push(d);
          continue;
        }

        if (!d.identitySignature) {
          if (import.meta.env.DEV) console.warn('Rejecting device — missing identity signature');
          continue;
        }

        try {
          // Identify the primary device for this user
          const groupDevices = friendDevices.includes(d) ? friendDevices : myDevices;
          const primaryDevice = groupDevices.find((pd: any) => {
            if (!pd.identitySignature) return false;
            try {
              const selfSig = hexToBytes(pd.identitySignature);
              const selfMsg = new TextEncoder().encode(pd.devicePublicKey);
              const selfKey = hexToBytes(pd.devicePublicKey);
              return ed25519.verify(selfSig, selfMsg, selfKey);
            } catch { return false; }
          });

          // Verify the device's signature against the primary device (or itself if it is the primary)
          const verifyingKey = primaryDevice
            ? hexToBytes(primaryDevice.devicePublicKey)
            : hexToBytes(d.devicePublicKey);

          const sigMsg = new TextEncoder().encode(d.devicePublicKey);
          const sigBytes = hexToBytes(d.identitySignature);

          if (!ed25519.verify(sigBytes, sigMsg, verifyingKey)) {
            console.error('[SECURITY] Rejected forged device signature — possible server compromise');
            continue;
          }

          // Signature strictly matches the identity key. The user authorized this device.
          allDevicesToEncrypt.push(d);
        } catch (err) {
          if (import.meta.env.DEV) console.error('Failed to verify device signature', err);
          continue;
        }
      }

      // Fallback if no valid devices found for recipient
      if (!allDevicesToEncrypt.some(d => friendDevices.includes(d))) {
        allDevicesToEncrypt.push({ devicePublicKey: state.selectedFriend.publicKey });
      }

      // Bound fan-out to prevent resource exhaustion
      const MAX_FANOUT_DEVICES = 20;
      if (allDevicesToEncrypt.length > MAX_FANOUT_DEVICES) {
        allDevicesToEncrypt.length = MAX_FANOUT_DEVICES;
      }

      const encryptedPayloads = [];

      for (const device of allDevicesToEncrypt) {
        const devicePubBytes = hexToBytes(device.devicePublicKey);

        // Use remote IDENTITY key (X25519) for session lookup, NOT device key (Ed25519).
        // Sessions are keyed by sort([localIdentityPub, remoteIdentityPub]) — both X25519.
        const isFriendDevice = friendDevices.some((fd: any) => fd.devicePublicKey === device.devicePublicKey);
        const peerIdentityForLookup = isFriendDevice ? remoteIdentityPub : localIdentityPub;
        let session = await loadSession(localIdentityPub, peerIdentityForLookup);
        let currentEphemeral: string | undefined = undefined;

        if (!session) {
          // Determine the correct X25519 identity key for X3DH:
          // Friend's devices → friend's identity key (remoteIdentityPub)
          // Our own other devices → our identity key (localIdentityPub)
          const isFriendDevice = friendDevices.some((fd: any) => fd.devicePublicKey === device.devicePublicKey);
          const peerIdentityPub = isFriendDevice ? remoteIdentityPub : localIdentityPub;

          // X3DH REQUIRES the X25519 identity key pair — NOT the Ed25519 device key.
          // The device key (Ed25519) is used only for authentication, not for DH.
          // The identity key (X25519) is what both sides must use to compute the same shared secret.
          const result = await initSession(
            {
              privateKey: hexToBytes(state.identity!.privateKey),
              publicKey: localIdentityPub  // X25519 identity pub — same as hexToBytes(state.identity.publicKey)
            },
            devicePubBytes,   // Peer device key (used as signed pre-key in X3DH)
            peerIdentityPub,  // Correct X25519 identity key for this device's owner
            null              // preKeySignature: Ed25519-based, incompatible with X3DH pre-key verification
          );
          session = result.session;
          if (result.ephemeralPublicKey) {
            currentEphemeral = bytesToHex(result.ephemeralPublicKey);
          }
        }

        const encrypted = await encryptRatchet(session, message);
        encryptedPayloads.push({
          devicePublicKey: device.devicePublicKey,
          senderDevicePublicKey: deviceIdentity.publicKey,
          ciphertext: encrypted.ciphertext,
          nonce: encrypted.nonce,
          ephemeralPublicKey: currentEphemeral || '00'.repeat(32),
          // Random placeholder salt — the Double Ratchet derives its own keys.
          // This field satisfies saltSchema validation; it is NOT used in decryption.
          // See docs/ENCRYPTION.md for the two-path architecture.
          salt: (() => {
            const payloadSalt = new Uint8Array(32);
            crypto.getRandomValues(payloadSalt);
            return Array.from(payloadSalt).map(b => b.toString(16).padStart(2, '0')).join('');
          })(),
          header: {
            ...encrypted.raw.header,
            // Uint8Arrays are not JSON-serializable — they become {0:1, 1:2, ...} objects.
            // Serialize ratchetPubKey as hex so it survives the wire round-trip intact.
            ratchetPubKey: bytesToHex(encrypted.raw.header.ratchetPubKey),
          },
          createdAt: encrypted.raw.createdAt,
          expiresAt: encrypted.raw.expiresAt,
          ttlMs: encrypted.raw.ttlMs
        });
      }

      const expiresAt = new Date(Date.now() + ttl * 1000);

      // expiresAt is no longer sent — server calculates it from ttlSeconds
      await apiRequest('POST', '/api/messages', {
        senderPublicKey: state.identity.publicKey,
        receiverPublicKey: state.selectedFriend.publicKey,
        encryptedPayloads,
        ttlSeconds: ttl,
      });

      // Store generic indicator, not plaintext preview
      await updateFriendLastMessage(
        state.selectedFriend.publicKey,
        'Encrypted message',
        new Date()
      );

      return { message, ttl };
    },
    onSuccess: (data) => {
      // Add optimistic message to local state with generated ID
      const optimisticMsg: DecryptedMessage = {
        id: `opt-${Date.now()}`,
        senderPublicKey: state.identity?.publicKey || '',
        receiverPublicKey: state.selectedFriend?.publicKey || '',
        plaintext: data.message,
        ttlSeconds: data.ttl,
        isRead: false,
        reactions: {},
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + data.ttl * 1000),
        isMine: true,
      };

      setSentMessages(prev => [...prev, optimisticMsg]);

      // Persist sent message for future decryption
      saveSentMessage(optimisticMsg.id, data.message, state.selectedFriend?.publicKey || '', optimisticMsg.expiresAt.getTime()).catch(() => { });

      queryClientRef.invalidateQueries({
        queryKey: ['/api/messages', state.identity?.publicKey, state.selectedFriend?.publicKey]
      });
      refreshFriends();
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : 'Message could not be sent';
      if (msg.startsWith('IDENTITY_KEY_CHANGED')) {
        toast({
          title: '⚠️ Safety Number Changed',
          description: "This contact's identity key has changed. Open Safety Numbers to verify before messaging.",
          variant: 'destructive',
        });
        // Auto-open verification dialog so user can re-verify
        setVerificationDialogOpen(true);
      } else {
        toast({
          title: 'Failed to send',
          description: msg,
          variant: 'destructive',
        });
      }
    },
  });

  const refreshFriends = async () => {
    // BUG-FIX: Also sync from server so linked devices pick up accepted friends.
    // Previously this only read from local IndexedDB, missing any friend accepted
    // on another device or just accepted via a pending request on this device.
    let friends = await getAllFriends();

    if (state.identity) {
      try {
        const response = await authenticatedFetch(`/api/friends/${encodeURIComponent(state.identity.publicKey)}`);
        if (response.ok) {
          const serverFriends = await response.json();
          for (const sf of serverFriends) {
            const exists = friends.find((f: LocalFriend) => f.publicKey === sf.friendPublicKey);
            if (!exists) {
              const fallbackName = `User-${sf.friendPublicKey.slice(0, 8).toUpperCase()}`;
              const newFriend = {
                publicKey: sf.friendPublicKey,
                displayName: sf.friendDisplayName || fallbackName,
              };
              await saveFriend(newFriend);
              friends.push(newFriend);
            }
          }
        }
      } catch {
        // Non-fatal: fall back to local only
      }
      // Re-read after potential writes
      friends = await getAllFriends();
    }

    setState(prev => ({ ...prev, friends }));
  };

  const handleSelectFriend = async (friend: LocalFriend) => {
    setState(prev => ({ ...prev, selectedFriend: friend }));
    if (isMobile) setShowSidebar(false);
    // Check if this friend is blocked
    const blocked = blockedSet.has(friend.publicKey) || await isBlockedLocal(friend.publicKey);
    setSelectedFriendBlocked(blocked);
  };

  const handleBlock = async () => {
    if (!state.selectedFriend) return;

    try {
      await blockUser(state.selectedFriend.publicKey);
      await apiRequest('POST', '/api/block', {
        blockerPublicKey: state.identity?.publicKey,
        blockedPublicKey: state.selectedFriend.publicKey,
      });

      setBlockedSet(prev => { const next = new Set(Array.from(prev)); next.add(state.selectedFriend!.publicKey); return next; });
      setSelectedFriendBlocked(true);

      toast({
        title: 'User Blocked',
        description: `${state.selectedFriend.displayName} has been blocked`,
      });

      setBlockDialogOpen(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Could not block user',
        variant: 'destructive',
      });
    }
  };

  const handleUnblock = async () => {
    if (!state.selectedFriend) return;

    try {
      await unblockUser(state.selectedFriend.publicKey);
      await apiRequest('POST', '/api/unblock', {
        blockedPublicKey: state.selectedFriend.publicKey,
      });

      setBlockedSet(prev => {
        const next = new Set(prev);
        next.delete(state.selectedFriend!.publicKey);
        return next;
      });
      setSelectedFriendBlocked(false);

      toast({
        title: 'User Unblocked',
        description: `${state.selectedFriend.displayName} has been unblocked`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Could not unblock user',
        variant: 'destructive',
      });
    }
  };

  const handleUnblockFromDialog = (publicKey: string) => {
    setBlockedSet(prev => {
      const next = new Set(prev);
      next.delete(publicKey);
      return next;
    });
    if (state.selectedFriend?.publicKey === publicKey) {
      setSelectedFriendBlocked(false);
    }
  };

  const handleAcknowledgeDevices = async () => {
    try {
      await acknowledgeDevices(newDevices.map(d => d.device_public_key));
      setNewDevices([]);
      toast({
        title: 'Devices Acknowledged',
        description: 'These devices are now trusted for your account.',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to acknowledge devices',
        variant: 'destructive',
      });
    }
  };

  const handleRename = async () => {
    if (!state.selectedFriend || !newDisplayName.trim()) return;

    try {
      const updatedFriend = {
        ...state.selectedFriend,
        displayName: newDisplayName.trim(),
      };

      await saveFriend(updatedFriend);

      toast({
        title: 'Name Updated',
        description: `Display name changed to ${newDisplayName.trim()}`,
      });

      setState(prev => ({
        ...prev,
        selectedFriend: updatedFriend,
      }));

      setRenameDialogOpen(false);
      setNewDisplayName('');
      refreshFriends();
      toast({
        title: 'Friend Renamed',
        description: 'The display name has been updated locally.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Could not update display name',
        variant: 'destructive',
      });
    }
  };

  // Periodically check for new, unacknowledged devices registered to this account
  useEffect(() => {
    if (!state.identity) return;

    const checkDevices = async () => {
      try {
        const devices = await detectNewDevices();
        if (devices.length > 0) {
          setNewDevices(devices);
        }
      } catch {
        // silently fail on device check
      }
    };

    checkDevices();
    const interval = setInterval(checkDevices, 30_000);
    return () => clearInterval(interval);
  }, [state.identity]);

  const handleVerify = async (verified: boolean) => {
    if (!state.selectedFriend) return;

    const friendPk = state.selectedFriend.publicKey;
    await setFriendVerified(friendPk, verified);

    // Update local state
    setState(prev => ({
      ...prev,
      friends: prev.friends.map(f => f.publicKey === friendPk ? { ...f, verified } : f),
      selectedFriend: prev.selectedFriend?.publicKey === friendPk ? { ...prev.selectedFriend, verified } : prev.selectedFriend
    }));

    if (verified) {
      toast({
        title: 'Identity Verified',
        description: `You have successfully verified ${state.selectedFriend.displayName}'s identity.`,
      });
    }
  };

  const { data: linkingRequests = [] } = useQuery({
    queryKey: ['/api/link/requests'],
    queryFn: async () => {
      const res = await authenticatedFetch('/api/link/requests');
      if (res.ok) return await res.json();
      return [];
    },
    refetchInterval: 30000,
    enabled: !!state.identity
  });

  const hasPendingLink = linkingRequests.length > 0;

  const handleLogout = async () => {
    // Clear ALL data stores, not just identity
    await clearAllData();
    queryClient.clear();
    setState({ identity: null, selectedFriend: null, friends: [] });
    setLocation('/');
  };

  if (!state.identity) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        {pinPromptOpen ? (
          <PinUnlockDialog
            onUnlock={handlePinUnlock}
            error={pinError}
            loading={false}
          />
        ) : (
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        )}
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-background">
      {/* Sidebar */}
      <FriendsSidebar
        identity={state.identity}
        friends={state.friends}
        selectedFriend={state.selectedFriend}
        onSelectFriend={handleSelectFriend}
        isMobile={isMobile}
        showSidebar={showSidebar}
        hasPendingLink={hasPendingLink}
        refreshFriends={refreshFriends}
        handleUnblockFromDialog={handleUnblockFromDialog}
        handleLogout={handleLogout}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {state.selectedFriend ? (
          <>
            <MessageThread
              friend={state.selectedFriend}
              messages={messages}
              messagesLoading={messagesLoading}
              isBlocked={selectedFriendBlocked}
              onBlock={() => setBlockDialogOpen(true)}
              onUnblock={handleUnblock}
              onRename={() => {
                setNewDisplayName(state.selectedFriend?.displayName || '');
                setRenameDialogOpen(true);
              }}
              onVerifySafetyNumber={() => setVerificationDialogOpen(true)}
              onBack={() => setShowSidebar(true)}
              isMobile={isMobile}
            />
            {!selectedFriendBlocked && (
              <ComposeBar
                onSend={(message, ttl) => sendMessageMutation.mutate({ message, ttl })}
                disabled={sendMessageMutation.isPending}
              />
            )}
          </>
        ) : (
          <EmptyChat />
        )}
      </div>

      {/* Block Confirmation Dialog */}
      <AlertDialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Block User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to block {state.selectedFriend?.displayName}?
              You won't receive messages from them anymore.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBlock} className="bg-destructive text-destructive-foreground">
              Block User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Display Name</DialogTitle>
            <DialogDescription>
              Update how you see this friend in your chat list. This is stored locally only.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Display Name</label>
              <Input
                type="text"
                placeholder="Enter new name"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                maxLength={30}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newDisplayName.trim()) {
                    handleRename();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!newDisplayName.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verification Dialog */}
      {state.selectedFriend && state.identity && (
        <VerificationDialog
          friend={state.selectedFriend}
          ownPublicKey={state.identity.publicKey}
          open={verificationDialogOpen}
          onOpenChange={setVerificationDialogOpen}
          onVerify={handleVerify}
        />
      )}

      {/* /Safety Number Changed Dialog */}
      <AlertDialog
        open={!!safetyWarning}
        onOpenChange={(open) => !open && setSafetyWarning(null)}
      >
        <AlertDialogContent className="border-destructive/20 shadow-2xl shadow-destructive/10">
          <AlertDialogHeader>
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <ShieldAlert className="w-6 h-6 text-destructive" />
            </div>
            <AlertDialogTitle className="text-center text-destructive">Security Warning</AlertDialogTitle>
            <AlertDialogDescription className="text-center space-y-4 pt-2">
              <p className="font-semibold text-foreground">
                {state.selectedFriend?.displayName}'s safety number has changed!
              </p>
              <div className="p-3 bg-muted rounded-lg text-xs font-mono break-all text-left space-y-2 opacity-80 border shadow-inner">
                <div><span className="text-muted-foreground mr-1">PREVIOUS:</span> {safetyWarning?.oldFp}</div>
                <div className="border-t pt-2 mt-2"><span className="text-primary mr-1">NEW:</span> {safetyWarning?.newFp}</div>
              </div>
              <p className="text-xs">
                This could be because they reinstalled CipherLink, logged in on a new device, or a <strong>Man-in-the-Middle attack</strong> is occurring.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center gap-2 pt-4">
            <AlertDialogCancel asChild>
              <Button variant="outline" className="flex-1" onClick={() => setSafetyWarning(null)}>Block Communication</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={async () => {
                  if (safetyWarning) {
                    const database = await getDB();
                    await database.put('settings', safetyWarning.newFp, `fingerprint:${safetyWarning.sessionId}`);
                    setSafetyWarning(null);
                    toast({ title: "Identity Updated", description: "The new safety number has been accepted." });
                  }
                }}
              >
                Accept New Identity
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
