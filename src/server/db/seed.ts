import { DatabaseSync } from 'node:sqlite';
import { AppConfig } from '../config.js';
import { hashPassword } from '../utils/password.js';

/**
 * Ensures the initial Admin account exists in the database on first startup.
 * Password is hashed with Argon2id; never stored in plain text.
 */
export async function ensureInitialAdmin(db: DatabaseSync, config: AppConfig): Promise<void> {
  const existingAdmin = db
    .prepare('SELECT id FROM users WHERE role = ? LIMIT 1')
    .get('ADMIN') as { id: number } | undefined;

  if (existingAdmin) {
    return;
  }

  const adminUserId = config.initialAdmin.userId;
  const adminName = config.initialAdmin.name;
  const initialPassword = config.initialAdmin.password || adminUserId;
  const passwordHash = await hashPassword(initialPassword);

  db.prepare(
    `INSERT OR IGNORE INTO users (
      user_id, full_name, password_hash, role, status, must_change_password, created_at, updated_at
    ) VALUES (?, ?, ?, 'ADMIN', 'ACTIVE', 1, datetime('now'), datetime('now'))`
  ).run(adminUserId, adminName, passwordHash);
}

