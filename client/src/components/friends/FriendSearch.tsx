/**
 * FriendSearch component.
 *
 * Provides a search input field to filter friends list.
 */

import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';

interface FriendSearchProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function FriendSearch({ searchQuery, onSearchChange }: FriendSearchProps) {
  return (
    <div className="relative px-2 mb-2">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground opacity-60" />
      <Input
        placeholder="Search friends..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="pl-9 pr-8 h-9 text-sm bg-sidebar-accent/30 border-sidebar-border focus-visible:ring-1"
      />
      {searchQuery && (
        <button
          onClick={() => onSearchChange('')}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground opacity-60 hover:opacity-100"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
