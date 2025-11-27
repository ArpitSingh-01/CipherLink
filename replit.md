# CipherLink - Privacy-Maximized Messaging Platform

## Overview
CipherLink is a futuristic, privacy-maximized messaging platform with end-to-end encryption, self-destructing messages, and zero metadata. The mission: "Messages that self-destruct. Privacy that doesn't."

## Tech Stack
- **Frontend**: React with TypeScript, Vite, Tailwind CSS, Framer Motion
- **Backend**: Express.js with in-memory storage
- **Encryption**: X25519 key exchange, AES-256-GCM encryption, BIP39 recovery phrases
- **Storage**: IndexedDB for client-side identity/friends, in-memory server storage

## Project Structure
```
client/src/
├── components/
│   ├── landing-page.tsx    # Landing page with Hero, Features, Security sections
│   ├── onboarding.tsx      # Identity generation and recovery phrase flow
│   └── chat-page.tsx       # Main chat interface with friend list and messaging
├── lib/
│   ├── crypto.ts           # Encryption/decryption, key generation, BIP39
│   ├── storage.ts          # IndexedDB operations for local identity/friends
│   └── queryClient.ts      # React Query configuration
└── pages/
    └── not-found.tsx       # 404 page

server/
├── routes.ts               # API endpoints for users, friends, messages, blocks
└── storage.ts              # In-memory storage implementation

shared/
└── schema.ts               # Data models for users, friends, messages, blocklist
```

## Key Features

### Privacy Features
- **Zero Identity**: No emails, phone numbers, or passwords - identity is a cryptographic key pair
- **Local-Only Username**: Display names stored only in IndexedDB, never uploaded
- **One-Time Friend Codes**: 8-character codes expire in 6 hours and are single-use
- **Self-Destructing Messages**: TTL options - 30s, 5min, 1hr, 6hr, 12hr, 24hr (default)
- **End-to-End Encryption**: AES-256-GCM with X25519 key exchange
- **Recovery Phrase**: 12-word BIP39 phrase for identity restoration

### API Endpoints
- `POST /api/users` - Register user (public key only)
- `POST /api/friend-codes` - Generate friend code
- `POST /api/friend-codes/redeem` - Redeem friend code
- `GET /api/friends/:publicKey` - Get friends list
- `POST /api/messages` - Send encrypted message
- `GET /api/messages/:userPublicKey` - Get messages for conversation
- `POST /api/block` - Block user
- `POST /api/unblock` - Unblock user

## Design System
- **Theme**: Dark futuristic with cyan (#00D9FF) primary and purple secondary accents
- **Typography**: Space Grotesk for headings, Inter for body, Roboto Mono for code
- **Effects**: Neon glow, glassmorphism, subtle animations

## Development
- Run: `npm run dev` (starts Express + Vite on port 5000)
- The app auto-restarts on file changes
