import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@shared/schema';
import { config } from './config';
import { logError } from './utils/log';

// Create PostgreSQL client — tuned for serverless vs long-running server
const client = postgres(config.databaseUrl, {
  max: config.isVercel ? 1 : 10,           // Serverless: 1 conn (pgbouncer pools); Dev: 10
  idle_timeout: config.isVercel ? 5 : 20,   // Serverless: close fast; Dev: keep warm
  connect_timeout: 5,                    // Fail fast on cold starts
});

// Create Drizzle ORM instance with schema
export const db = drizzle(client, { schema });

// Export client for cleanup on shutdown
export const pgClient = client;

// Graceful shutdown helper
export async function closeDatabase(): Promise<void> {
  try {
    await client.end();
    if (config.isDev) {
      process.stdout.write('Database connection closed\n');
    }
  } catch (error) {
    logError('closeDatabase', error);
  }
}
