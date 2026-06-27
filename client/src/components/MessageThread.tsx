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
}: MessageThreadProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
              .filter((msg) => new Date(msg.expiresAt) > new Date())
              .map((msg) => (
                <MessageBubble key={msg.id} message={msg} isMine={msg.isMine} />
              ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </ScrollArea>

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
