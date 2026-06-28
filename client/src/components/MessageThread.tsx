/**
 * MessageThread component displaying chat messages, sender avatars, safety number verification, and auto-scroll behavior.
 */
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Shield,
  Lock,
  MoreVertical,
  Settings,
  LockOpen,
  Timer,
  ChevronLeft,
  Ban,
  UserCheck,
} from 'lucide-react';
import { formatDistanceToNow, differenceInSeconds, format } from 'date-fns';
import { motion } from 'framer-motion';
import { type LocalFriend, type DecryptedMessage } from '@shared/schema';

// ── Message Bubble Component ──────────────────────────────────────────────────
function MessageBubble({
  message,
  isMine,
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
      initial={{ opacity: 0, x: isMine ? 30 : -30, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 350, damping: 25 }}
      className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-3`}
    >
      <div className={`max-w-[75%] ${isMine ? 'order-2' : ''}`}>
        <div
          className={`px-4 py-2.5 rounded-2xl transition-all duration-300 ${
            isMine
              ? 'bg-primary text-primary-foreground rounded-br-md'
              : 'bg-muted rounded-bl-md'
          } ${
            isExpiringSoon
              ? 'border border-amber-500/50 glow-ember animate-destruct bg-amber-950/10'
              : ''
          }`}
        >
          <p className="text-sm break-words">{message.plaintext}</p>
        </div>
        <div className={`flex items-center gap-2 mt-1 text-xs text-muted-foreground ${isMine ? 'justify-end' : ''}`}>
          <span>{format(new Date(message.createdAt), 'HH:mm')}</span>
          <div className={`flex items-center gap-1 ${isExpiringSoon ? 'text-amber-500 animate-destruct' : ''}`}>
            <Timer className="w-3 h-3" />
            <span>{formatTimeLeft(timeLeft)}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Chat Header Component ─────────────────────────────────────────────────────
function ChatHeader({
  friend,
  onBlock,
  onUnblock,
  isUserBlocked,
  onBack,
  isMobile,
  onRename,
  onVerify,
  isOnline,
}: {
  friend: LocalFriend;
  onBlock: () => void;
  onUnblock: () => void;
  isUserBlocked: boolean;
  onBack: () => void;
  isMobile: boolean;
  onRename: () => void;
  onVerify: () => void;
  isOnline: boolean;
}) {
  const initials = friend.displayName
    .split(' ')
    .map((n) => n[0])
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
          <AvatarFallback
            className={`${
              isUserBlocked ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
            }`}
          >
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
          {isUserBlocked && (
            <Badge variant="destructive" className="h-4 px-1 text-[10px]">
              Blocked
            </Badge>
          )}
          {friend.verified && !isUserBlocked && (
            <Badge
              variant="secondary"
              className="h-4 px-1 text-[10px] bg-primary/10 text-primary border-none"
            >
              Verified
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Lock className="w-3 h-3" />
            <span>End-to-end encrypted</span>
          </div>
          <span className="opacity-40">•</span>
          <div className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-destructive shadow-[0_0_8px_#ef4444]'} animate-pulse`} />
            <span className="text-[10px] uppercase font-mono tracking-wider">{isOnline ? 'Online' : 'Offline'}</span>
          </div>
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
              <Ban className="w-4 h-4 mr-2" />
              Block User
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

interface MessageThreadProps {
  friend: LocalFriend;
  messages: DecryptedMessage[];
  messagesLoading: boolean;
  isBlocked: boolean;
  onBlock: () => void;
  onUnblock: () => void;
  onRename: () => void;
  onVerifySafetyNumber: () => void;
  onBack: () => void;
  isMobile: boolean;
  onLoadOlder: () => Promise<void>;
  hasMore: boolean;
  olderLoading: boolean;
  isTyping: boolean;
}

// ── Main MessageThread Component ──────────────────────────────────────────────
export function MessageThread({
  friend,
  messages,
  messagesLoading,
  isBlocked,
  onBlock,
  onUnblock,
  onRename,
  onVerifySafetyNumber,
  onBack,
  isMobile,
  onLoadOlder,
  hasMore,
  olderLoading,
  isTyping,
}: MessageThreadProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousScrollHeight = useRef<number>(0);
  const previousScrollTop = useRef<number>(0);

  // Auto-scroll to bottom on first load or when a new message arrives
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      // If we didn't prepend, scroll to bottom
      const wasAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
      if (wasAtBottom || messages.length <= 50) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [messages]);

  // Adjust scroll position when older messages are prepended
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (previousScrollHeight.current > 0) {
      const delta = el.scrollHeight - previousScrollHeight.current;
      if (delta > 0 && el.scrollTop === 0) {
        el.scrollTop = delta;
      }
    }

    previousScrollHeight.current = el.scrollHeight;
    previousScrollTop.current = el.scrollTop;
  }, [messages]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;

    // Detect top scroll for pagination
    if (el.scrollTop === 0 && hasMore && !olderLoading) {
      onLoadOlder();
    }

    previousScrollHeight.current = el.scrollHeight;
    previousScrollTop.current = el.scrollTop;
  };

  return (
    <>
      <ChatHeader
        friend={friend}
        onBlock={onBlock}
        onUnblock={onUnblock}
        isUserBlocked={isBlocked}
        onRename={onRename}
        onBack={onBack}
        isMobile={isMobile}
        onVerify={onVerifySafetyNumber}
        isOnline={isOnline}
      />

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-3"
      >
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
            {olderLoading && (
              <div className="flex justify-center py-2">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {messages
              .filter((msg) => new Date(msg.expiresAt) > new Date())
              .map((msg) => (
                <MessageBubble key={msg.id} message={msg} isMine={msg.isMine} />
              ))}
            {isTyping && (
              <div className="flex items-center gap-1 p-3 bg-muted/40 rounded-2xl rounded-bl-sm w-16 mb-3 animate-pulse">
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {isBlocked && (
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
              onClick={onUnblock}
            >
              <LockOpen className="w-3.5 h-3.5 mr-1.5" />
              Unblock
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
