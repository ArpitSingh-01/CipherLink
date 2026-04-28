import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@shared/schema';

// Validate required environment variables
function validateDatabaseConfig(): string {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL environment variable is required. ' +
      'Please set it to your Supabase PostgreSQL connection string.'
    );
  }

  return connectionString;
}

// Create PostgreSQL client with connection pooling
const connectionString = validateDatabaseConfig();
const client = postgres(connectionString, {
  max: 10, // Maximum connections in pool
  idle_timeout: 20, // Close idle connections after 20 seconds
  connect_timeout: 10, // Connection timeout in seconds
});

// Create Drizzle ORM instance with schema
export const db = drizzle(client, { schema });

// Export client for cleanup on shutdown
export const pgClient = client;

const isDev = process.env.NODE_ENV !== 'production';

// Graceful shutdown helper
export async function closeDatabase(): Promise<void> {
  try {
    await client.end();
    if (isDev) console.log('Database connection closed');
  } catch (error) {
    if (isDev) console.error('Error closing database connection:', error);
  }
}
