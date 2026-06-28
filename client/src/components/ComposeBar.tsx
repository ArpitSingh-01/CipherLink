/**
 * ComposeBar component for text entry, TTL selection, and message dispatch.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Clock, Send } from 'lucide-react';
import { TTL_OPTIONS, DEFAULT_TTL } from '@shared/schema';
import { motion } from 'framer-motion';

interface ComposeBarProps {
  onSend: (message: string, ttl: number) => void;
  disabled: boolean;
  onTyping?: () => void;
}

export function ComposeBar({ onSend, disabled, onTyping }: ComposeBarProps) {
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value);
    if (onTyping) {
      onTyping();
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
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            className="pr-12"
            data-testid="input-message"
          />
        </div>
        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Button
            onClick={handleSend}
            disabled={!message.trim() || disabled}
            data-testid="button-send-message"
          >
            <Send className="w-4 h-4" />
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
