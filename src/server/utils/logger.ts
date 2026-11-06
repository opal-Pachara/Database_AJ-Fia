import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../db/connection.js';
import { appConfig } from '../config.js';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'SECURITY';
export type LogCategory = 'WEBHOOK' | 'AUTH' | 'FILE' | 'BACKUP' | 'ADMIN' | 'SYSTEM';

export interface LogEntryInput {
  level: LogLevel;
  category: LogCategory;
  action: string;
  actorUserId?: string | null;
  ipAddress?: string | null;
  details?: Record<string, unknown>;
}

/**
 * Logs system events both to the SQLite `system_logs` table and to a daily log file in `logs/`.
 * Section 7 & Section 11: ต้องมี Logging ที่สามารถตรวจสอบปัญหาย้อนหลังได้
 */
export function writeSystemLog(entry: LogEntryInput): void {
  const timestamp = new Date().toISOString();
  const detailsJson = entry.details ? JSON.stringify(entry.details) : null;

  // 1. Write to daily log file on disk (resilient even if DB has issues)
  try {
    if (!fs.existsSync(appConfig.paths.logsDir)) {
      fs.mkdirSync(appConfig.paths.logsDir, { recursive: true });
    }
    const datePrefix = timestamp.slice(0, 10);
    const logFilePath = path.join(appConfig.paths.logsDir, `system-${datePrefix}.log`);
    const line = `[${timestamp}] [${entry.level}] [${entry.category}] action=${entry.action} actor=${entry.actorUserId || '-'} ip=${entry.ipAddress || '-'} details=${detailsJson || '{}'}\n`;
    fs.appendFileSync(logFilePath, line, 'utf8');
  } catch (fileErr) {
    console.error('Failed to write file log:', fileErr);
  }

  // 2. Write to SQLite system_logs table
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO system_logs (
        level, category, action, actor_user_id, ip_address, details_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      entry.level,
      entry.category,
      entry.action,
      entry.actorUserId ?? null,
      entry.ipAddress ?? null,
      detailsJson,
      timestamp
    );
  } catch (dbErr) {
    console.error('Failed to write DB system_log:', dbErr);
  }
}

