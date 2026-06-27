/**
 * FriendRequestList component.
 *
 * Renders incoming pending friend requests and handles custom naming before acceptance.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Bell, UserCheck, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export interface PendingRequest {
  id: string;
  friendPublicKey: string;
  friendName: string | null;
  createdAt: string;
}

interface FriendRequestListProps {
  pendingRequests: PendingRequest[];
  onAccept: (friendPublicKey: string, friendName: string) => Promise<void>;
  onDecline: (friendPublicKey: string) => Promise<void>;
  isAccepting: boolean;
  isDeclining: boolean;
}

export function FriendRequestList({
  pendingRequests,
  onAccept,
  onDecline,
  isAccepting,
  isDeclining,
}: FriendRequestListProps) {
  const [selectedRequest, setSelectedRequest] = useState<PendingRequest | null>(null);
  const [friendName, setFriendName] = useState('');

  const handleAcceptSubmit = async () => {
    if (!selectedRequest) return;
    await onAccept(selectedRequest.friendPublicKey, friendName || 'Anonymous');
    setSelectedRequest(null);
    setFriendName('');
  };

  if (selectedRequest) {
    return (
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
            onClick={() => {
              setSelectedRequest(null);
              setFriendName('');
            }}
          >
            Back
          </Button>
          <Button
            className="flex-1"
            onClick={handleAcceptSubmit}
            disabled={isAccepting}
          >
            {isAccepting ? 'Accepting...' : 'Accept'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {pendingRequests.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Bell className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No pending requests</p>
          <p className="text-sm">Share your friend code to connect with others</p>
        </div>
      ) : (
        pendingRequests.map((request) => (
          <div
            key={request.id}
            className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
          >
            <Avatar className="w-10 h-10">
              <AvatarFallback className="bg-primary/10 text-primary">
                ?
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">New Friend Request</p>
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
                onClick={() => onDecline(request.friendPublicKey)}
                disabled={isDeclining}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
