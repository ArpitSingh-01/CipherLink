/**
 * Single source of truth for all configuration.
 * Validates required vars at startup so the app fails fast with a clear message.
 */

function required(key: string, description: string): string {
  const val = process.env[key];
  if (!val && process.env.NODE_ENV === 'production') {
    console.error(`FATAL: Missing required environment variable: ${key} (${description})`);
    process.exit(1);
  }
  return val ?? '';
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  isDev:  process.env.NODE_ENV !== 'production',
  port:   parseInt(process.env.PORT ?? '5000', 10),
  isVercel: process.env.VERCEL === '1',
  databaseUrl: required('DATABASE_URL', 'PostgreSQL database connection string'),

  supabase: {
    url:         required('SUPABASE_URL',            'Supabase project URL'),
    anonKey:     required('SUPABASE_ANON_KEY',       'Supabase publishable key'),
    serviceKey:  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  },

  cors: {
    origins: process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()) ?? [],
  },

  cron: {
    secret: required('CRON_SECRET', 'Authorization secret for cleanup cron endpoint'),
  },
} as const;
