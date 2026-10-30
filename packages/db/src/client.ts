import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { sql, type SQL, type SQLChunk } from 'drizzle-orm';
import * as schema from './schema';

export type DatabaseClient = BetterSQLite3Database<typeof schema> & { $client: Database.Database };
export function createDatabase(filename: string): DatabaseClient {
  const client = new Database(filename);
  client.pragma('busy_timeout = 5000');
  return drizzle(client, { schema });
}

/** Bind positional SQLite parameters through Drizzle, including reusable bulk statements.
 * SQL text is application-owned. Values are always bound, never interpolated into SQL.
 */
export function query(db: DatabaseClient, statement: string) {
  const bind = (values: unknown[]): SQL => {
    const chunks: SQLChunk[] = [];
    let offset = 0;
    // Ignore question marks inside quoted strings, identifiers and SQL comments.
    const tokens = /'(?:''|[^'])*'|"(?:""|[^"])*"|`[^`]*`|\[[^\]]*\]|--[^\n]*|\/\*[\s\S]*?\*\/|\?/g;
    let match: RegExpExecArray | null;
    let parameter = 0;
    while ((match = tokens.exec(statement))) {
      if (match[0] !== '?') continue;
      chunks.push(sql.raw(statement.slice(offset, match.index)), sql`${values[parameter++]}`);
      offset = match.index + 1;
    }
    if (parameter !== values.length) throw new Error('SQL parameter count mismatch');
    chunks.push(sql.raw(statement.slice(offset)));
    return sql.join(chunks, sql.raw(''));
  };
  const execute = <T>(operation: () => T): T => {
    try {
      return operation();
    } catch (error) {
      // SQLite constraint and trigger errors are part of the domain error contract.
      if (error instanceof Error && error.cause instanceof Error) throw error.cause;
      throw error;
    }
  };
  return {
    get: (...values: unknown[]) => execute(() => db.get(bind(values))),
    all: (...values: unknown[]) => execute(() => db.all(bind(values))),
    run: (...values: unknown[]) => execute(() => db.run(bind(values))),
  };
}
