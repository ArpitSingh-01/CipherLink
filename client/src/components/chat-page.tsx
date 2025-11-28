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
import { getIdentity, getAllFriends, saveFriend, getFriend, updateFriendLastMessage, blockUser, unblockUser, getBlockedUsers, clearIdentity } from '@/lib/storage';
import { encryptMessage, decryptMessage, hexToBytes, generateFriendCode } from '@/lib/crypto';
import { TTL_OPTIONS, DEFAULT_TTL, type LocalFriend, type DecryptedMessage } from '@shared/schema';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  Shield,
  Send,
  UserPlus,
  Copy,
  Check,
  Clock,
  MoreVertical,
  UserX,
  Settings,
  LogOut,
  MessageSquare,
  Users,
  QrCode,
  Timer,
  Lock,
  Search,
  ChevronLeft,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow, differenceInSeconds, format } from 'date-fns';

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
          className={`px-4 py-2.5 rounded-2xl ${
            isMine
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
      <div className="flex-1 min-w-0 text-left">
        <p className="font-medium truncate">{friend.displayName}</p>
        {friend.lastMessagePreview && (
          <p className="text-sm text-muted-foreground truncate">
            {friend.lastMessagePreview}
          </p>
        )}
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
    onError: () => {
      toast({
        title: 'Error',
        description: 'Could not generate friend code',
        variant: 'destructive',
      });
    },
  });
  
  const redeemCodeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/friend-codes/redeem', {
        code: enteredCode.trim().toUpperCase(),
        redeemerPublicKey: publicKey,
        friendName: friendName || 'Anonymous',
      });
      
      return response.json();
    },
    onSuccess: async (data: { friendPublicKey: string }) => {
      await saveFriend({
        publicKey: data.friendPublicKey,
        displayName: friendName || 'Anonymous',
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
    onError: () => {
      toast({
        title: 'Invalid Code',
        description: 'The code is invalid or has expired',
        variant: 'destructive',
      });
    },
  });
  
  const copyCode = () => {
    if (generatedCode) {
      navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
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

function ChatHeader({
  friend,
  onBlock,
  onBack,
  isMobile,
}: {
  friend: LocalFriend;
  onBlock: () => void;
  onBack: () => void;
  isMobile: boolean;
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
      <Avatar className="w-10 h-10">
        <AvatarFallback className="bg-primary/10 text-primary">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1">
        <p className="font-medium">{friend.displayName}</p>
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
          <DropdownMenuItem onClick={onBlock} className="text-destructive">
            <UserX className="w-4 h-4 mr-2" />
            Block User
          </DropdownMenuItem>
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClientRef = useQueryClient();
  
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  useEffect(() => {
    // Load identity and friends from IndexedDB
    const loadData = async () => {
      const identity = await getIdentity();
      if (!identity) {
        setLocation('/onboarding');
        return;
      }
      
      const friends = await getAllFriends();
      setState(prev => ({
        ...prev,
        identity: {
          publicKey: identity.publicKey,
          privateKey: identity.privateKey,
          localUsername: identity.localUsername,
        },
        friends,
      }));
    };
    
    loadData();
  }, [setLocation]);
  
  // Fetch messages when a friend is selected
  const { data: serverMessages, isLoading: messagesLoading } = useQuery({
    queryKey: ['/api/messages', state.identity?.publicKey, state.selectedFriend?.publicKey],
    queryFn: async () => {
      if (!state.identity || !state.selectedFriend) return [];
      const res = await fetch(
        `/api/messages/${state.identity.publicKey}?friendPublicKey=${encodeURIComponent(state.selectedFriend.publicKey)}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error('Failed to fetch messages');
      return res.json();
    },
    enabled: !!state.selectedFriend && !!state.identity,
    refetchInterval: 3000, // Poll every 3 seconds
  });
  
  // Store optimistic sent messages locally
  const [sentMessages, setSentMessages] = useState<DecryptedMessage[]>([]);
  
  // Decrypt messages when they change
  useEffect(() => {
    const decryptMessages = async () => {
      if (!serverMessages || !state.identity || !state.selectedFriend) return;
      
      const decrypted: DecryptedMessage[] = [];
      
      for (const msg of serverMessages as any[]) {
        try {
          const isSentByMe = msg.senderPublicKey === state.identity.publicKey;
          
          let plaintext = '';
          if (!isSentByMe) {
            // For received messages, decrypt with our private key
            plaintext = await decryptMessage(
              msg.ciphertext,
              msg.nonce,
              msg.ephemeralPublicKey,
              hexToBytes(state.identity.privateKey)
            );
          } else {
            // For our sent messages, find the plaintext from sentMessages
            const sentMsg = sentMessages.find(m => m.id === msg.id);
            if (sentMsg) {
              plaintext = sentMsg.plaintext;
            } else {
              // Shouldn't happen, but skip if we can't find the plaintext
              console.warn('Sent message not found in local cache:', msg.id);
              continue;
            }
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
          console.error('Failed to decrypt message:', error);
        }
      }
      
      // Merge decrypted messages with any optimistic sent messages not yet on server
      const serverIds = new Set(decrypted.map(m => m.id));
      const optimistic = sentMessages.filter(m => !serverIds.has(m.id));
      
      const allMessages = [...decrypted, ...optimistic].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      );
      
      setMessages(allMessages);
    };
    
    decryptMessages();
  }, [serverMessages, state.identity, state.selectedFriend, sentMessages]);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  const sendMessageMutation = useMutation({
    mutationFn: async ({ message, ttl }: { message: string; ttl: number }) => {
      if (!state.identity || !state.selectedFriend) throw new Error('No identity or friend');
      
      const encrypted = await encryptMessage(
        message,
        hexToBytes(state.identity.privateKey),
        hexToBytes(state.selectedFriend.publicKey)
      );
      
      const expiresAt = new Date(Date.now() + ttl * 1000);
      
      await apiRequest('POST', '/api/messages', {
        senderPublicKey: state.identity.publicKey,
        receiverPublicKey: state.selectedFriend.publicKey,
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
        ephemeralPublicKey: encrypted.ephemeralPublicKey,
        ttlSeconds: ttl,
        expiresAt: expiresAt.toISOString(),
      });
      
      // Update friend's last message
      await updateFriendLastMessage(
        state.selectedFriend.publicKey,
        message.substring(0, 50),
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
      
      queryClientRef.invalidateQueries({ 
        queryKey: ['/api/messages', state.identity?.publicKey, state.selectedFriend?.publicKey] 
      });
      refreshFriends();
    },
    onError: () => {
      toast({
        title: 'Failed to send',
        description: 'Message could not be sent',
        variant: 'destructive',
      });
    },
  });
  
  const refreshFriends = async () => {
    const friends = await getAllFriends();
    setState(prev => ({ ...prev, friends }));
  };
  
  const handleSelectFriend = (friend: LocalFriend) => {
    setState(prev => ({ ...prev, selectedFriend: friend }));
    if (isMobile) setShowSidebar(false);
  };
  
  const handleBlock = async () => {
    if (!state.selectedFriend) return;
    
    try {
      await blockUser(state.selectedFriend.publicKey);
      await apiRequest('POST', '/api/block', {
        blockerPublicKey: state.identity?.publicKey,
        blockedPublicKey: state.selectedFriend.publicKey,
      });
      
      toast({
        title: 'User Blocked',
        description: `${state.selectedFriend.displayName} has been blocked`,
      });
      
      setState(prev => ({ ...prev, selectedFriend: null }));
      setBlockDialogOpen(false);
      refreshFriends();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Could not block user',
        variant: 'destructive',
      });
    }
  };

  const handleLogout = async () => {
    await clearIdentity();
    queryClient.clear();
    setLocation('/');
  };
  
  if (!state.identity) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
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
                <AddFriendDialog 
                  publicKey={state.identity.publicKey} 
                  onFriendAdded={refreshFriends}
                />
              </div>
              <div className="text-sm text-muted-foreground truncate">
                {state.identity.localUsername}
              </div>
            </div>
            
            {/* Friends List */}
            <ScrollArea className="flex-1">
              <div className="p-2">
                {state.friends.length === 0 ? (
                  <EmptyFriends onAddFriend={() => {}} />
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
            <div className="p-4 border-t border-sidebar-border">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="w-full justify-start">
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={handleLogout}>
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
              onBack={() => setShowSidebar(true)}
              isMobile={isMobile}
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
                  {messages.map((msg) => (
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
            
            <MessageInput
              onSend={(message, ttl) => sendMessageMutation.mutate({ message, ttl })}
              disabled={sendMessageMutation.isPending}
            />
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
    </div>
  );
}
