import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
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
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import {
  saveFriend,
  unblockUser,
} from '@/lib/storage';
import { generateFriendCode } from '@/lib/crypto';
import { type LocalFriend } from '@shared/schema';
import { apiRequest } from '@/lib/queryClient';
import { authenticatedFetch } from '@/lib/auth';
import {
  Shield,
  ShieldCheck,
  LogOut,
  LockOpen,
  UserPlus,
  Bell,
  Check,
  Copy,
  QrCode,
  UserCheck,
  X,
  Settings,
  ShieldOff,
  Ban,
  Users,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { IdentityDialog } from './identity-dialog';
import { DevicesDialog } from './devices-dialog';

// ── Friend List Item Component ────────────────────────────────────────────────
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
      className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors hover-elevate ${
        isSelected ? 'bg-accent' : ''
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
          <h2 className="font-bold truncate text-left">{friend.displayName}</h2>
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
        <p className="text-xs text-muted-foreground truncate opacity-70 text-left">
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

// ── Empty Friends Component ──────────────────────────────────────────────────
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

// ── Add Friend Dialog ────────────────────────────────────────────────────────
function AddFriendDialog({
  publicKey,
  onFriendAdded,
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

      await apiRequest('POST', '/api/friend-codes', {
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
        description: `Could not generate friend code: ${data}`,
        variant: 'destructive',
      });
    },
  });

  const redeemCodeMutation = useMutation({
    mutationFn: async () => {
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

// ── Pending Requests Dialog ──────────────────────────────────────────────────
function PendingRequestsDialog({
  publicKey,
  onRequestHandled,
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
    refetchInterval: 30000,
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

// ── Blocked Users Dialog ─────────────────────────────────────────────────────
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
      await unblockUser(blockedPublicKey);
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

// ── Main FriendsSidebar Component ────────────────────────────────────────────
export function FriendsSidebar({
  identity,
  friends,
  selectedFriend,
  onSelectFriend,
  isMobile,
  showSidebar,
  hasPendingLink,
  refreshFriends,
  handleUnblockFromDialog,
  handleLogout,
}: {
  identity: { publicKey: string; localUsername: string };
  friends: LocalFriend[];
  selectedFriend: LocalFriend | null;
  onSelectFriend: (friend: LocalFriend) => void;
  isMobile: boolean;
  showSidebar: boolean;
  hasPendingLink: boolean;
  refreshFriends: () => Promise<void>;
  handleUnblockFromDialog: (blockedPublicKey: string) => void;
  handleLogout: () => Promise<void>;
}) {
  return (
    <AnimatePresence>
      {(showSidebar || !isMobile) && (
        <motion.div
          initial={isMobile ? { x: -300 } : false}
          animate={{ x: 0 }}
          exit={{ x: -300 }}
          className={`${
            isMobile ? 'absolute inset-y-0 left-0 z-50' : 'relative'
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
                  publicKey={identity.publicKey}
                  onRequestHandled={refreshFriends}
                />
                <AddFriendDialog
                  publicKey={identity.publicKey}
                  onFriendAdded={refreshFriends}
                />
              </div>
            </div>
            <div className="text-sm text-muted-foreground truncate">
              {identity.localUsername}
            </div>
          </div>

          {/* Friends List */}
          <ScrollArea className="flex-grow flex flex-col">
            <div className="p-2">
              {friends.length === 0 ? (
                <EmptyFriends onAddFriend={() => {}} />
              ) : (
                friends.map((friend) => (
                  <FriendListItem
                    key={friend.publicKey}
                    friend={friend}
                    isSelected={selectedFriend?.publicKey === friend.publicKey}
                    onClick={() => onSelectFriend(friend)}
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
                  <IdentityDialog publicKey={identity.publicKey} />
                </div>
                <div className="mb-1">
                  <DevicesDialog />
                </div>
                <div className="mb-1">
                  <BlockedUsersDialog
                    identityPublicKey={identity.publicKey}
                    onUnblock={handleUnblockFromDialog}
                  />
                </div>
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
