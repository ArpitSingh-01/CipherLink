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
import { useToast } from '@/hooks/use-toast';
import { useWebSocketNotifications } from '@/hooks/use-ws-notifications';
import { getIdentity, getDeviceIdentity, getAllFriends, saveFriend, getFriend, updateFriendLastMessage, blockUser, unblockUser, isBlocked as isBlockedLocal, getBlockedUsers, clearAllData, hasEncryptedIdentity, getIdentityEncrypted, setDecryptedIdentity, saveSentMessage, getSentMessage, setFriendVerified, getDB, detectIdentityKeyChange, clearSessionMemory, ensureSessionCryptoVersion } from '@/lib/storage';
import { hexToBytes, bytesToHex, generateFriendCode, computeSafetyNumber, MIN_PIN_LENGTH, zeroizeBytes } from '@/lib/crypto';
import { ensureDeviceRegistered, detectNewDevices, acknowledgeDevices } from '@/lib/devices';
import { loadSession, initSession, encryptRatchet, decryptRatchet, setPersistentHooks } from '@/lib/session';
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
import { DevicesDialog } from './devices-dialog';
import { IdentityDialog } from './identity-dialog';

interface ChatState {
  identity: {
    publicKey: string;
    privateKey: string;
    localUsername: string;
  } | null;
  selectedFriend: LocalFriend | null;
  friends: LocalFriend[];
}

function MessageBubble({
  message,
  isMine
}: {
  message: DecryptedMessage;
  isMine: boolean;
}) {
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    const updateTimeLeft = () => {
      const seconds = differenceInSeconds(new Date(message.expiresAt), new Date());
      setTimeLeft(Math.max(0, seconds));
    };

    updateTimeLeft();
    const interval = setInterval(updateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [message.expiresAt]);

  const formatTimeLeft = (seconds: number) => {
    if (seconds <= 0) return 'Expired';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  };

  const isExpiringSoon = timeLeft > 0 && timeLeft < 60;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-3`}
    >
      <div className={`max-w-[75%] ${isMine ? 'order-2' : ''}`}>
        <div
          className={`px-4 py-2.5 rounded-2xl ${isMine
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-muted rounded-bl-md'
            }`}
        >
          <p className="text-sm break-words">{message.plaintext}</p>
        </div>
        <div className={`flex items-center gap-2 mt-1 text-xs text-muted-foreground ${isMine ? 'justify-end' : ''}`}>
          <span>{format(new Date(message.createdAt), 'HH:mm')}</span>
          <div className={`flex items-center gap-1 ${isExpiringSoon ? 'text-destructive animate-destruct' : ''}`}>
            <Timer className="w-3 h-3" />
            <span>{formatTimeLeft(timeLeft)}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function FriendListItem({
  friend,
  isSelected,
  onClick,
}: {
  friend: LocalFriend;
  isSelected: boolean;
  onClick: () => void;
}) {
  const initials = friend.displayName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors hover-elevate ${isSelected ? 'bg-accent' : ''
        }`}
      data-testid={`friend-item-${friend.publicKey.slice(0, 8)}`}
    >
      <Avatar className="w-10 h-10">
        <AvatarFallback className="bg-primary/10 text-primary text-sm">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <h2 className="font-bold truncate">{friend.displayName}</h2>
          {friend.verified && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center cursor-help">
                    <ShieldCheck className="w-3 h-3 text-primary" />
                  </div>
                </TooltipTrigger>
                <TooltipContent>Identity Verified</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate opacity-70">
          {friend.publicKey.slice(0, 16)}...
        </p>
      </div>
      {friend.lastMessageAt && (
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(friend.lastMessageAt), { addSuffix: false })}
        </span>
      )}
    </button>
  );
}

function AddFriendDialog({
  publicKey,
  onFriendAdded
}: {
  publicKey: string;
  onFriendAdded: () => void;
}) {
  const [mode, setMode] = useState<'generate' | 'enter'>('generate');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [enteredCode, setEnteredCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [friendName, setFriendName] = useState('');
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const generateCodeMutation = useMutation({
    mutationFn: async () => {
      const code = generateFriendCode();
      const expires = new Date(Date.now() + 6 * 60 * 60 * 1000); // 6 hours

      const response = await apiRequest('POST', '/api/friend-codes', {
        code,
        identityPublicKey: publicKey,
        expiresAt: expires.toISOString(),
      });

      return { code, expiresAt: expires };
    },
    onSuccess: (data) => {
      setGeneratedCode(data.code);
      setExpiresAt(data.expiresAt);
    },
    onError: (data) => {
      toast({
        title: 'Error',
        description: `Could not generate friend code ;; ${data}`,
        variant: 'destructive',
      });
    },
  });

  const redeemCodeMutation = useMutation({
    mutationFn: async () => {
      // SEC-FIX-3: friendName removed from server request — stored locally only
      // Friend display names are relationship metadata that must never leave the device
      const response = await apiRequest('POST', '/api/friend-codes/redeem', {
        code: enteredCode.trim().toUpperCase(),
        redeemerPublicKey: publicKey,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to redeem code');
      }

      return response.json();
    },
    onSuccess: async (data: { friendPublicKey: string }) => {
      await saveFriend({
        publicKey: data.friendPublicKey,
        displayName: friendName || `User-${data.friendPublicKey.slice(0, 8).toUpperCase()}`,
      });

      toast({
        title: 'Friend Added',
        description: 'You can now start messaging securely!',
      });

      setOpen(false);
      setEnteredCode('');
      setFriendName('');
      onFriendAdded();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'The code is invalid or has expired',
        variant: 'destructive',
      });
    },
  });

  const copyCode = () => {
    if (generatedCode) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(generatedCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      } else {
        // Fallback for non-secure contexts
        const textArea = document.createElement('textarea');
        textArea.value = generatedCode;
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          setCopied(true);
          setTimeout(() => setCopied(false), 3000);
        } catch (err) {
          console.error('Copy failed:', err);
        }
        document.body.removeChild(textArea);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" data-testid="button-add-friend">
          <UserPlus className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Friend</DialogTitle>
          <DialogDescription>
            Connect with friends using one-time codes. No searching, no discovery.
          </DialogDescription>
        </DialogHeader>

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
                onClick={() => generateCodeMutation.mutate()}
                disabled={generateCodeMutation.isPending}
                data-testid="button-generate-code"
              >
                {generateCodeMutation.isPending ? 'Generating...' : 'Generate Friend Code'}
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
              onClick={() => redeemCodeMutation.mutate()}
              disabled={enteredCode.length !== 8 || redeemCodeMutation.isPending}
              data-testid="button-redeem-code"
            >
              {redeemCodeMutation.isPending ? 'Adding...' : 'Add Friend'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface PendingRequest {
  id: string;
  friendPublicKey: string;
  friendName: string | null;
  createdAt: string;
}

function PendingRequestsDialog({
  publicKey,
  onRequestHandled
}: {
  publicKey: string;
  onRequestHandled: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [friendName, setFriendName] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<PendingRequest | null>(null);
  const { toast } = useToast();

  const { data: pendingRequests = [], refetch } = useQuery({
    queryKey: ['/api/friend-requests', publicKey],
    queryFn: async () => {
      const res = await authenticatedFetch(`/api/friend-requests/${encodeURIComponent(publicKey)}`);
      if (!res.ok) throw new Error('Failed to fetch pending requests');
      return res.json();
    },
    refetchInterval: 2000, // Poll every 2 seconds
  });

  const acceptMutation = useMutation({
    mutationFn: async ({ friendPublicKey, friendName }: { friendPublicKey: string; friendName: string }) => {
      const response = await apiRequest('POST', '/api/friend-requests/accept', {
        userPublicKey: publicKey,
        friendPublicKey,
        friendName: friendName || 'Anonymous',
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error((errData as any).error || 'Failed to accept request');
      }

      return await response.json() as { success: boolean; friendPublicKey: string; friendName: string | null };
    },
    onSuccess: async (data: { success: boolean; friendPublicKey: string; friendName: string | null }) => {
      // BUG-FIX: Persist the new friend to local IndexedDB so they appear in the sidebar.
      // Previously this was missing — the server accepted the request but the local
      // friend store was never updated, so the friend never appeared in the chat list.
      // Use the locally entered friendName (from component state), NOT data.friendName
      // which is always null since the server no longer stores display names.
      await saveFriend({
        publicKey: data.friendPublicKey,
        displayName: friendName || `User-${data.friendPublicKey.slice(0, 8).toUpperCase()}`,
      });

      toast({
        title: 'Friend Added',
        description: 'You can now start messaging!',
      });
      setSelectedRequest(null);
      setFriendName('');
      setOpen(false);
      refetch();
      onRequestHandled();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Could not accept friend request',
        variant: 'destructive',
      });
    },
  });

  const declineMutation = useMutation({
    mutationFn: async (friendPublicKey: string) => {
      const response = await apiRequest('POST', '/api/friend-requests/decline', {
        userPublicKey: publicKey,
        friendPublicKey,
      });

      if (!response.ok) {
        throw new Error('Failed to decline request');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Request Declined',
        description: 'Friend request has been declined',
      });
      refetch();
      onRequestHandled();
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Could not decline friend request',
        variant: 'destructive',
      });
    },
  });

  const pendingCount = pendingRequests.length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="relative" data-testid="button-pending-requests">
          <Bell className="w-4 h-4" />
          {pendingCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground text-xs rounded-full flex items-center justify-center">
              {pendingCount}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Friend Requests</DialogTitle>
          <DialogDescription>
            {pendingCount > 0
              ? `You have ${pendingCount} pending friend request${pendingCount > 1 ? 's' : ''}`
              : 'No pending friend requests'
            }
          </DialogDescription>
        </DialogHeader>

        {selectedRequest ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Someone wants to connect with you. Give them a name you'll recognize.
            </p>
            <div>
              <label className="text-sm font-medium mb-2 block">Their Display Name</label>
              <Input
                placeholder="What should we call them?"
                value={friendName}
                onChange={(e) => setFriendName(e.target.value)}
                data-testid="input-accept-friend-name"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setSelectedRequest(null)}
              >
                Back
              </Button>
              <Button
                className="flex-1"
                onClick={() => acceptMutation.mutate({
                  friendPublicKey: selectedRequest.friendPublicKey,
                  friendName: friendName || 'Anonymous'
                })}
                disabled={acceptMutation.isPending}
              >
                {acceptMutation.isPending ? 'Accepting...' : 'Accept'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {pendingRequests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Bell className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No pending requests</p>
                <p className="text-sm">Share your friend code to connect with others</p>
              </div>
            ) : (
              pendingRequests.map((request: PendingRequest) => (
                <div
                  key={request.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
                >
                  <Avatar className="w-10 h-10">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      ?
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-medium">New Friend Request</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-green-500 hover:text-green-600 hover:bg-green-500/10"
                      onClick={() => setSelectedRequest(request)}
                    >
                      <UserCheck className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => declineMutation.mutate(request.friendPublicKey)}
                      disabled={declineMutation.isPending}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ChatHeader({
  friend,
  onBlock,
  onUnblock,
  isUserBlocked,
  onBack,
  isMobile,
  onRename,
  onVerify,
}: {
  friend: LocalFriend;
  onBlock: () => void;
  onUnblock: () => void;
  isUserBlocked: boolean;
  onBack: () => void;
  isMobile: boolean;
  onRename: () => void;
  onVerify: () => void;
}) {
  const initials = friend.displayName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex items-center gap-3 p-4 border-b border-border">
      {isMobile && (
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
      )}
      <div className="relative">
        <Avatar className="w-10 h-10">
          <AvatarFallback className={`${isUserBlocked ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
            {isUserBlocked ? <Ban className="w-5 h-5" /> : initials}
          </AvatarFallback>
        </Avatar>
        {friend.verified && !isUserBlocked && (
          <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-0.5">
            <UserCheck className="w-3.5 h-3.5 text-primary fill-primary/20" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium truncate">{friend.displayName}</p>
          {isUserBlocked && <Badge variant="destructive" className="h-4 px-1 text-[10px]">Blocked</Badge>}
          {friend.verified && !isUserBlocked && <Badge variant="secondary" className="h-4 px-1 text-[10px] bg-primary/10 text-primary border-none">Verified</Badge>}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Lock className="w-3 h-3" />
          <span>End-to-end encrypted</span>
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreVertical className="w-5 h-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onVerify}>
            <Shield className="w-4 h-4 mr-2" />
            Verify Identity
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onRename}>
            <Settings className="w-4 h-4 mr-2" />
            Change Display Name
          </DropdownMenuItem>
          {isUserBlocked ? (
            <DropdownMenuItem onClick={onUnblock} className="text-green-600">
              <LockOpen className="w-4 h-4 mr-2" />
              Unblock User
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={onBlock} className="text-destructive">
              <UserX className="w-4 h-4 mr-2" />
              Block User
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function MessageInput({
  onSend,
  disabled,
}: {
  onSend: (message: string, ttl: number) => void;
  disabled: boolean;
}) {
  const [message, setMessage] = useState('');
  const [ttl, setTtl] = useState(DEFAULT_TTL.toString());

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSend(message.trim(), parseInt(ttl));
      setMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-4 border-t border-border">
      <div className="flex items-end gap-3">
        <Select value={ttl} onValueChange={setTtl}>
          <SelectTrigger className="w-28" data-testid="select-ttl">
            <Clock className="w-4 h-4 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TTL_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value.toString()}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1 relative">
          <Input
            placeholder="Type a message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            className="pr-12"
            data-testid="input-message"
          />
        </div>
        <Button
          onClick={handleSend}
          disabled={!message.trim() || disabled}
          data-testid="button-send-message"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
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
        .catch(err => console.error("Failed to compute safety number", err));
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

function EmptyFriends({ onAddFriend }: { onAddFriend: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Users className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-lg font-medium mb-2">No Friends Yet</h3>
        <p className="text-muted-foreground text-sm max-w-xs mb-4">
          Add friends using one-time codes to start messaging securely
        </p>
      </div>
    </div>
  );
}

// ==================== BLOCKED USERS DIALOG ====================

function BlockedUsersDialog({
  identityPublicKey,
  onUnblock,
}: {
  identityPublicKey: string;
  onUnblock: (publicKey: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const { data: blockedUsers = [], refetch, isLoading } = useQuery({
    queryKey: ['/api/blocked', identityPublicKey],
    queryFn: async () => {
      const res = await authenticatedFetch(`/api/blocked/${encodeURIComponent(identityPublicKey)}`);
      if (!res.ok) throw new Error('Failed to fetch blocked users');
      return res.json() as Promise<string[]>;
    },
    enabled: open && !!identityPublicKey,
  });

  const unblockMutation = useMutation({
    mutationFn: async (blockedPublicKey: string) => {
      // Remove from local storage
      await unblockUser(blockedPublicKey);
      // Remove from server
      await apiRequest('POST', '/api/unblock', {
        blockedPublicKey,
      });
      return blockedPublicKey;
    },
    onSuccess: (blockedPublicKey) => {
      toast({
        title: 'User Unblocked',
        description: 'You can now receive messages from this user again.',
      });
      onUnblock(blockedPublicKey);
      refetch();
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Could not unblock user',
        variant: 'destructive',
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setOpen(true); }}>
          <ShieldOff className="w-4 h-4 mr-2" />
          Blocked Users
        </DropdownMenuItem>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <Ban className="w-6 h-6 text-destructive" />
          </div>
          <DialogTitle className="text-center">Blocked Users</DialogTitle>
          <DialogDescription className="text-center">
            Users you've blocked cannot send you messages. Unblock them to resume communication.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : blockedUsers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ShieldOff className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No blocked users</p>
              <p className="text-sm">Your blocklist is empty</p>
            </div>
          ) : (
            blockedUsers.map((pubKey: string) => (
              <div
                key={pubKey}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border/50"
              >
                <Avatar className="w-10 h-10">
                  <AvatarFallback className="bg-destructive/10 text-destructive">
                    <Ban className="w-4 h-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-muted-foreground truncate">
                    {pubKey.slice(0, 16)}...{pubKey.slice(-8)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-green-600 border-green-600/30 hover:bg-green-50 dark:hover:bg-green-950/20"
                  onClick={() => unblockMutation.mutate(pubKey)}
                  disabled={unblockMutation.isPending}
                >
                  <LockOpen className="w-3.5 h-3.5 mr-1.5" />
                  Unblock
                </Button>
              </div>
            ))
          )}
        </div>
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
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClientRef = useQueryClient();

  // PIN rate-limiting: max 5 attempts before 30-second lockout
  const pinAttemptCount = useRef(0);
  const pinLockoutUntil = useRef<number>(0);

  // WebSocket push notifications — makes messages appear instantly (<100ms)
  // instead of waiting for the next 2s poll cycle
  useWebSocketNotifications(state.identity?.publicKey);

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

    // BUG-FIX (Bug 1): Poll every 10 s for newly accepted friends so linked
    // devices (Brave) update without a page reload.
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
    }, 10000); // every 10 seconds

    return () => clearInterval(syncFriendsInterval);
  }, [setLocation]);

  // SEC-22: Cryptographically Correct Double Ratchet Persistence Hooks
  useEffect(() => {
    if (!state.identity) return;

    // Wipe any stale ratchet sessions from old crypto formats on every identity load.
    // This is essential for Vite HMR where the IDB upgrade callback doesn't re-fire.
    ensureSessionCryptoVersion().catch(e => console.warn('[CipherLink] ensureSessionCryptoVersion failed:', e));

    setPersistentHooks({
      onIdentityObserved: async (sessionId: string, newFp: string) => {
        const database = await getDB();
        const stored = await database.get('settings', `fingerprint:${sessionId}`);

        if (typeof stored === 'string' && stored !== newFp) {
          // MITM detected or device reset
          console.warn(`[SEC] Identity mismatch for session ${sessionId}: expected ${stored}, got ${newFp}`);
          setSafetyWarning({ sessionId, oldFp: stored, newFp });
          return false; // Block initialization
        }

        await database.put('settings', newFp, `fingerprint:${sessionId}`);
        return true;
      },
      onRatchetKeyObserved: async () => true // Allow automatic sub-key rotation
    });
  }, [state.identity]);

  const handlePinUnlock = async () => {
    // Rate-limit check
    const now = Date.now();
    if (now < pinLockoutUntil.current) {
      const remaining = Math.ceil((pinLockoutUntil.current - now) / 1000);
      setPinError(`Too many attempts. Try again in ${remaining}s.`);
      return;
    }
    if (pin.length < MIN_PIN_LENGTH) {
      setPinError(`PIN must be at least ${MIN_PIN_LENGTH} characters`);
      return;
    }
    try {
      const identity = await getIdentityEncrypted(pin);
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
      setPin('');
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
    refetchInterval: 2000, // Poll every 2 seconds for responsive messaging
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
              console.error('Failed to parse message payloads', e);
            }

            const matchingPayloads = payloads.filter(p => p.devicePublicKey === deviceIdentity.publicKey || p.devicePublicKey === state.identity?.publicKey);

            if (matchingPayloads.length !== 1) {
              if (matchingPayloads.length > 1) {
                console.warn('Multiple payloads found for this device. Rejecting.');
              }
              continue;
            }

            const targetPayload = matchingPayloads[0];
            if (targetPayload) {
              const { ciphertext, nonce, ephemeralPublicKey, senderDevicePublicKey } = targetPayload;
              const localDevicePub = hexToBytes(deviceIdentity.publicKey);
              const peerDeviceHex = senderDevicePublicKey || msg.senderPublicKey;
              const peerPubForSession = hexToBytes(peerDeviceHex);

              let session = await loadSession(hexToBytes(state.identity!.publicKey), peerPubForSession);
              console.debug('[Ratchet] loadSession result:', {
                found: !!session,
                isInitiator: session?.isInitiator,
                localPub: state.identity!.publicKey.slice(0, 12),
                peerPub: peerDeviceHex.slice(0, 12),
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
                  const sigBytes = new Uint8Array(peerDevice.identitySignature.match(/.{2}/g)!.map((b: string) => parseInt(b, 16)));

                  // CRITICAL FIX: identitySignature was signed with the primary device's Ed25519 key.
                  // msg.senderPublicKey is the X25519 identity key — WRONG curve, wrong key, wrong for verify.
                  // The primary (TOFU) device is self-signed: ed25519.verify(sig, devKey, devKey).
                  // Secondary devices are endorsed by the primary: ed25519.verify(sig, devKey, primaryDevKey).
                  // In both cases the verifying key is an Ed25519 devicePublicKey, NOT the X25519 identity key.
                  // We find the primary device by checking which device is self-signed (TOFU bootstrap).
                  const primaryDevice = peerDevices.find((d: any) => {
                    try {
                      const selfSig = new Uint8Array(d.identitySignature.match(/.{2}/g)!.map((b: string) => parseInt(b, 16)));
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
                  console.debug('[Ratchet] initSession (responder):', {
                    localIdentityPub: state.identity!.publicKey.slice(0, 12),
                    remoteDeviceKey: peerDeviceHex.slice(0, 12),
                    remoteIdentityPub: msg.senderPublicKey.slice(0, 12),
                    ephemeralPub: ephemeralPublicKey?.slice(0, 12),
                  });
                  const res = await initSession(
                    { privateKey: hexToBytes(state.identity!.privateKey), publicKey: hexToBytes(state.identity!.publicKey) },
                    peerPubForSession,
                    hexToBytes(msg.senderPublicKey),
                    null,
                    reqSenderEph
                  );
                  console.debug('[Ratchet] responder session created:', {
                    isInitiator: res.session.isInitiator,
                    sessionId: res.session.sessionId.slice(0, 16),
                  });
                  session = res.session;
                } catch (e: any) {
                  console.error('Responder init failed:', e.message);
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
                  console.warn('Ratchet decryption failed', error);
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
      // SEC-STABLE-01: Use authenticatedFetch — raw fetch() bypasses Ed25519 auth
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
          console.warn(`Rejecting device ${d.devicePublicKey} - missing identity signature`);
          continue;
        }

        try {
          // Identify the primary device for this user
          const groupDevices = friendDevices.includes(d) ? friendDevices : myDevices;
          const primaryDevice = groupDevices.find((pd: any) => {
            if (!pd.identitySignature) return false;
            try {
              const selfSig = new Uint8Array(pd.identitySignature.match(/.{2}/g)!.map((b: string) => parseInt(b, 16)));
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
          const sigBytes = new Uint8Array(d.identitySignature.match(/.{2}/g)!.map((b: string) => parseInt(b, 16)));

          if (!ed25519.verify(sigBytes, sigMsg, verifyingKey)) {
            console.error(`Rejecting device ${d.devicePublicKey} - FORGED identity signature! Server is untrustworthy!`);
            continue;
          }

          // Signature strictly matches the identity key. The user authorized this device.
          allDevicesToEncrypt.push(d);
        } catch (err) {
          console.error(`Failed to verify signature for device ${d.devicePublicKey}`, err);
          continue;
        }
      }

      // Fallback if no valid devices found for recipient
      if (!allDevicesToEncrypt.some(d => friendDevices.includes(d))) {
        allDevicesToEncrypt.push({ devicePublicKey: state.selectedFriend.publicKey });
      }

      // SEC-STABLE-02: Bound fan-out to prevent resource exhaustion
      const MAX_FANOUT_DEVICES = 20;
      if (allDevicesToEncrypt.length > MAX_FANOUT_DEVICES) {
        allDevicesToEncrypt.length = MAX_FANOUT_DEVICES;
      }

      const encryptedPayloads = [];

      for (const device of allDevicesToEncrypt) {
        const devicePubBytes = hexToBytes(device.devicePublicKey);

        let session = await loadSession(localIdentityPub, devicePubBytes);
        let currentEphemeral: string | undefined = undefined;

        if (!session) {
          // Determine the correct X25519 identity key for X3DH:
          // - Friend's devices → friend's identity key (remoteIdentityPub)
          // - Our own other devices → our identity key (localIdentityPub)
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
          salt: '00'.repeat(32),
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

      // SEC-FIX-4: expiresAt is no longer sent — server calculates it from ttlSeconds
      await apiRequest('POST', '/api/messages', {
        senderPublicKey: state.identity.publicKey,
        receiverPublicKey: state.selectedFriend.publicKey,
        encryptedPayloads,
        ttlSeconds: ttl,
      });

      // SEC-09: Store generic indicator, not plaintext preview
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

      // SEC-21: Persist sent message for future decryption
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

  // SEC-DEVICE-01: Periodically check for new, unacknowledged devices registered to this account
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
    // SEC-06: Clear ALL data stores, not just identity
    await clearAllData();
    queryClient.clear();
    setState({ identity: null, selectedFriend: null, friends: [] });
    setLocation('/');
  };

  if (!state.identity) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        {pinPromptOpen ? (
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
              onChange={(e) => { setPin(e.target.value); setPinError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handlePinUnlock(); }}
              className="mb-2"
              data-testid="input-unlock-pin"
            />
            {pinError && <p className="text-sm text-destructive mb-2">{pinError}</p>}
            <Button className="w-full" onClick={handlePinUnlock} data-testid="button-unlock">
              Unlock
            </Button>
          </div>
        ) : (
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        )}
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-background">
      {/* Sidebar */}
      <AnimatePresence>
        {(showSidebar || !isMobile) && (
          <motion.div
            initial={isMobile ? { x: -300 } : false}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            className={`${isMobile ? 'absolute inset-y-0 left-0 z-50' : 'relative'
              } w-80 border-r border-border bg-sidebar flex flex-col`}
          >
            {/* Sidebar Header */}
            <div className="p-4 border-b border-sidebar-border">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-primary" />
                  </div>
                  <span className="font-bold">CipherLink</span>
                </div>
                <div className="flex items-center gap-2">
                  <PendingRequestsDialog
                    publicKey={state.identity.publicKey}
                    onRequestHandled={refreshFriends}
                  />
                  <AddFriendDialog
                    publicKey={state.identity.publicKey}
                    onFriendAdded={refreshFriends}
                  />
                </div>
              </div>
              <div className="text-sm text-muted-foreground truncate">
                {state.identity.localUsername}
              </div>
            </div>

            {/* Friends List */}
            <ScrollArea className="flex-1">
              <div className="p-2">
                {state.friends.length === 0 ? (
                  <EmptyFriends onAddFriend={() => { }} />
                ) : (
                  state.friends.map((friend) => (
                    <FriendListItem
                      key={friend.publicKey}
                      friend={friend}
                      isSelected={state.selectedFriend?.publicKey === friend.publicKey}
                      onClick={() => handleSelectFriend(friend)}
                    />
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Sidebar Footer */}
            <div className="p-4 border-t border-sidebar-border relative">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="w-full justify-start relative">
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                    {hasPendingLink && (
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 p-1">
                  <div className="mb-1">
                    <IdentityDialog publicKey={state.identity.publicKey} />
                  </div>
                  <div className="mb-1">
                    <DevicesDialog />
                  </div>
                  <div className="mb-1">
                    <BlockedUsersDialog
                      identityPublicKey={state.identity.publicKey}
                      onUnblock={handleUnblockFromDialog}
                    />
                  </div>
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {state.selectedFriend ? (
          <>
            <ChatHeader
              friend={state.selectedFriend}
              onBlock={() => setBlockDialogOpen(true)}
              onUnblock={handleUnblock}
              isUserBlocked={selectedFriendBlocked}
              onRename={() => {
                setNewDisplayName(state.selectedFriend?.displayName || '');
                setRenameDialogOpen(true);
              }}
              onBack={() => setShowSidebar(true)}
              isMobile={isMobile}
              onVerify={() => setVerificationDialogOpen(true)}
            />

            <ScrollArea className="flex-1 p-4">
              {messagesLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-center text-muted-foreground">
                  <div>
                    <Lock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No messages yet</p>
                    <p className="text-sm">Send an encrypted message to start</p>
                  </div>
                </div>
              ) : (
                <>
                  {messages
                    .filter(msg => new Date(msg.expiresAt) > new Date())
                    .map((msg) => (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      isMine={msg.isMine}
                    />
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </ScrollArea>

            {selectedFriendBlocked ? (
              <div className="p-4 border-t border-border">
                <div className="flex items-center justify-center gap-3 p-4 rounded-xl bg-destructive/5 border border-destructive/20">
                  <Ban className="w-5 h-5 text-destructive shrink-0" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-destructive">This user is blocked</p>
                    <p className="text-xs text-muted-foreground">Unblock them to resume messaging</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-green-600 border-green-600/30 hover:bg-green-50 dark:hover:bg-green-950/20 shrink-0"
                    onClick={handleUnblock}
                  >
                    <LockOpen className="w-3.5 h-3.5 mr-1.5" />
                    Unblock
                  </Button>
                </div>
              </div>
            ) : (
              <MessageInput
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

      {/* SEC-01/SEC-22: Safety Number Changed Dialog */}
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
