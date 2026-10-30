import path from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { DatabaseClient } from './client';

/** Baseline is idempotent for existing databases; legacy column/data upgrades run next. */
export function migrateDatabase(db: DatabaseClient, root: string) {
  migrate(db, { migrationsFolder: path.join(root, 'packages/db/migrations') });
}
