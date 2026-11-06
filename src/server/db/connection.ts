import { DatabaseSync } from 'node:sqlite';
import { AppConfig, appConfig, ensureStorageDirectories } from '../config.js';
import { initializeSchema } from './schema.js';

let activeDb: DatabaseSync | null = null;
let activeDbPath: string | null = null;

export function getDb(config: AppConfig = appConfig): DatabaseSync {
  ensureStorageDirectories(config);
  if (activeDb && activeDbPath === config.paths.databaseFile) {
    return activeDb;
  }
  if (activeDb) {
    try {
      activeDb.close();
    } catch {
      // Ignore close error
    }
  }
  const db = new DatabaseSync(config.paths.databaseFile);
  initializeSchema(db);
  activeDb = db;
  activeDbPath = config.paths.databaseFile;
  return db;
}

export function closeDb(): void {
  if (activeDb) {
    try {
      activeDb.close();
    } catch {
      // Ignore close error
    }
    activeDb = null;
    activeDbPath = null;
  }
}

export function runInTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback error
    }
    throw err;
  }
}

