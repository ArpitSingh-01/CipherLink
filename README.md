# CipherLink

A privacy-first encrypted messaging application with self-destructing messages.

## Features

- End-to-end encryption
- Self-destructing messages with configurable TTL
- Friend codes for secure connections
- Zero-metadata architecture
- Persistent storage with Supabase PostgreSQL

## Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account (for database)

## Environment Setup

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Configure your environment variables:
   - `DATABASE_URL`: Your Supabase PostgreSQL connection string
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_ANON_KEY`: Your Supabase anonymous key

## Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to Project Settings → Database
3. Copy the connection string (URI format) for `DATABASE_URL`
4. Go to Project Settings → API for `SUPABASE_URL` and `SUPABASE_ANON_KEY`

## Database Migration

Push the schema to your database:
```bash
npm run db:push
```

## Development

Start the development server:
```bash
npm run dev
```

## Production Build

Build for production:
```bash
npm run build
```

Start the production server:
```bash
npm start
```


## Testing

Run tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

## Vercel Deployment

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard:
   - `DATABASE_URL`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `NODE_ENV=production`
3. Deploy

## Project Structure

```
├── client/           # React frontend
├── server/           # Express backend
│   ├── db.ts         # Database connection
│   ├── storage.ts    # Storage interface
│   ├── supabase-storage.ts  # Supabase implementation
│   ├── cleanup.ts    # Expired data cleanup
│   └── routes.ts     # API routes
├── shared/           # Shared types and schema
└── .kiro/            # Kiro specs and configuration
```

## License

MIT
