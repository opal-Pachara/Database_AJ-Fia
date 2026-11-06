import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, backup as sqliteOnlineBackup } from 'node:sqlite';
import cron from 'node-cron';
import { appConfig } from '../config.js';
import { closeDb, getDb } from '../db/connection.js';
import { getDiskSpaceInfo } from '../utils/disk.js';
import { writeSystemLog } from '../utils/logger.js';

export interface BackupManifestFileEntry {
  relativePath: string;
  sizeBytes: number;
  sha256: string;
}

export interface BackupManifest {
  backupId: string;
  backupType: 'SCHEDULED_6H' | 'MANUAL';
  createdAt: string;
  databaseFile: string;
  databaseSizeBytes: number;
  databaseSha256: string;
  totalFilesCount: number;
  totalFilesBytes: number;
  files: BackupManifestFileEntry[];
}

export interface BackupExecutionResult {
  backupId: string;
  backupType: 'SCHEDULED_6H' | 'MANUAL';
  targetPath: string;
  status: 'SUCCESS' | 'FAILED';
  dbSizeBytes: number;
  totalFilesCount: number;
  totalFilesBytes: number;
  manifestSha256?: string;
  errorMessage?: string;
  startedAt: string;
  completedAt: string;
}

function computeFileSha256(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
}

function listAllFilesRecursive(baseDir: string, currentRel = ''): string[] {
  if (!fs.existsSync(baseDir)) {
    return [];
  }
  const results: string[] = [];
  const entries = fs.readdirSync(path.join(baseDir, currentRel), { withFileTypes: true });
  for (const entry of entries) {
    const relPath = currentRel ? path.posix.join(currentRel, entry.name) : entry.name;
    if (entry.isDirectory()) {
      results.push(...listAllFilesRecursive(baseDir, relPath));
    } else if (entry.isFile()) {
      results.push(relPath);
    }
  }
  return results;
}

/**
 * Executes a full online backup of the SQLite database, all stored files, and recovery metadata,
 * followed by cryptographic and SQLite integrity verification.
 *
 * REQ-12: ระบบ Backup
 */
export async function performSystemBackup(
  backupType: 'SCHEDULED_6H' | 'MANUAL' = 'SCHEDULED_6H'
): Promise<BackupExecutionResult> {
  const db = getDb();
  const now = new Date();
  const timestampSlug = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')
    .replace('T', '_');
  const backupId = `BK_${timestampSlug}_${crypto.randomBytes(3).toString('hex')}`;
  const startedAt = now.toISOString();
  const targetDir = path.join(appConfig.paths.backupsDir, backupId);

  // Record RUNNING in backup_logs
  db.prepare(
    `INSERT INTO backup_logs (
      backup_id, backup_type, target_path, status, started_at
    ) VALUES (?, ?, ?, 'RUNNING', ?)`
  ).run(backupId, backupType, targetDir, startedAt);

  try {
    // 1. Check disk space before starting backup
    const diskInfo = getDiskSpaceInfo(appConfig.paths.backupsDir);
    if (diskInfo.freeBytes < 100 * 1024 * 1024) {
      throw new Error(
        `DISK_SPACE_LOW_FOR_BACKUP: พื้นที่ว่างสำหรับเก็บ Backup เหลือน้อยเกินไป (${diskInfo.freeBytes} bytes)`
      );
    }

    fs.mkdirSync(targetDir, { recursive: true });
    const backupDbDir = path.join(targetDir, 'database');
    const backupStorageDir = path.join(targetDir, 'storage');
    fs.mkdirSync(backupDbDir, { recursive: true });
    fs.mkdirSync(backupStorageDir, { recursive: true });

    const backupDbPath = path.join(backupDbDir, 'app.sqlite');

    // 2. Online Atomic SQLite Backup (does not corrupt or block original DB)
    if (typeof sqliteOnlineBackup === 'function') {
      await sqliteOnlineBackup(db, backupDbPath);
    } else {
      const escapedPath = backupDbPath.replace(/'/g, "''");
      db.exec(`VACUUM INTO '${escapedPath}'`);
    }

    // Verify backed-up database integrity using PRAGMA integrity_check
    const verifyDb = new DatabaseSync(backupDbPath, { readOnly: true });
    try {
      const integrityRow = verifyDb.prepare('PRAGMA integrity_check').get() as
        | { integrity_check: string }
        | undefined;
      if (!integrityRow || integrityRow.integrity_check !== 'ok') {
        throw new Error(
          `BACKUP_DB_INTEGRITY_FAILED: ${JSON.stringify(integrityRow)}`
        );
      }
    } finally {
      verifyDb.close();
    }

    const dbStat = fs.statSync(backupDbPath);
    const dbSha256 = computeFileSha256(backupDbPath);

    // 3. Copy all storage files (private, public, urls) and verify SHA-256 of every copied file
    const allRelativeFiles = listAllFilesRecursive(appConfig.paths.storage);
    const manifestFiles: BackupManifestFileEntry[] = [];
    let totalFilesBytes = 0;

    for (const relFile of allRelativeFiles) {
      const srcFile = path.join(appConfig.paths.storage, ...relFile.split('/'));
      const dstFile = path.join(backupStorageDir, ...relFile.split('/'));
      fs.mkdirSync(path.dirname(dstFile), { recursive: true });
      fs.copyFileSync(srcFile, dstFile);

      const srcSha = computeFileSha256(srcFile);
      const dstSha = computeFileSha256(dstFile);
      if (srcSha !== dstSha) {
        throw new Error(
          `BACKUP_FILE_CHECKSUM_MISMATCH: ไฟล์ ${relFile} สำรองข้อมูลไม่ตรงกับต้นฉบับ`
        );
      }

      const fileStat = fs.statSync(dstFile);
      totalFilesBytes += fileStat.size;
      manifestFiles.push({
        relativePath: relFile,
        sizeBytes: fileStat.size,
        sha256: dstSha,
      });
    }

    // 4. Write manifest.json for recovery verification
    const manifest: BackupManifest = {
      backupId,
      backupType,
      createdAt: new Date().toISOString(),
      databaseFile: 'database/app.sqlite',
      databaseSizeBytes: dbStat.size,
      databaseSha256: dbSha256,
      totalFilesCount: manifestFiles.length,
      totalFilesBytes,
      files: manifestFiles,
    };

    const manifestPath = path.join(targetDir, 'manifest.json');
    const manifestJson = JSON.stringify(manifest, null, 2);
    fs.writeFileSync(manifestPath, manifestJson, 'utf8');
    const manifestSha256 = crypto.createHash('sha256').update(manifestJson).digest('hex');

    const completedAt = new Date().toISOString();

    // 5. Update backup_logs status = SUCCESS
    db.prepare(
      `UPDATE backup_logs
       SET status = 'SUCCESS',
           db_size_bytes = ?,
           total_files_count = ?,
           total_files_bytes = ?,
           manifest_sha256 = ?,
           completed_at = ?
       WHERE backup_id = ?`
    ).run(
      dbStat.size,
      manifestFiles.length,
      totalFilesBytes,
      manifestSha256,
      completedAt,
      backupId
    );

    writeSystemLog({
      level: 'INFO',
      category: 'BACKUP',
      action: 'BACKUP_COMPLETED_SUCCESS',
      details: {
        backupId,
        backupType,
        targetDir,
        dbSizeBytes: dbStat.size,
        totalFilesCount: manifestFiles.length,
        totalFilesBytes,
        manifestSha256,
      },
    });

    return {
      backupId,
      backupType,
      targetPath: targetDir,
      status: 'SUCCESS',
      dbSizeBytes: dbStat.size,
      totalFilesCount: manifestFiles.length,
      totalFilesBytes,
      manifestSha256,
      startedAt,
      completedAt,
    };
  } catch (err) {
    const completedAt = new Date().toISOString();
    const errorMessage = err instanceof Error ? err.message : String(err);

    try {
      db.prepare(
        `UPDATE backup_logs
         SET status = 'FAILED',
             error_message = ?,
             completed_at = ?
         WHERE backup_id = ?`
      ).run(errorMessage, completedAt, backupId);
    } catch {
      // Ignore DB update error
    }

    writeSystemLog({
      level: 'ERROR',
      category: 'BACKUP',
      action: 'BACKUP_FAILED',
      details: {
        backupId,
        backupType,
        targetDir,
        errorMessage,
      },
    });

    return {
      backupId,
      backupType,
      targetPath: targetDir,
      status: 'FAILED',
      dbSizeBytes: 0,
      totalFilesCount: 0,
      totalFilesBytes: 0,
      errorMessage,
      startedAt,
      completedAt,
    };
  }
}

/**
 * Restores the database and all storage files from a verified backup snapshot,
 * and verifies SHA-256 checksums of all restored files and database integrity.
 *
 * REQ-12 & Phase 9: ต้องสามารถ Restore ข้อมูลได้ และตรวจสอบความครบถ้วนของข้อมูลหลัง Restore
 */
export async function restoreSystemFromBackup(backupId: string): Promise<{
  backupId: string;
  restoredFilesCount: number;
  restoredDbSizeBytes: number;
  verifiedIntegrity: boolean;
}> {
  const backupDir = path.join(appConfig.paths.backupsDir, path.basename(backupId));
  const manifestPath = path.join(backupDir, 'manifest.json');

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`ไม่พบไฟล์ manifest.json ในชุดสำรองข้อมูล: ${backupId}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as BackupManifest;
  const backupDbPath = path.join(backupDir, 'database', 'app.sqlite');
  const backupStorageDir = path.join(backupDir, 'storage');

  if (!fs.existsSync(backupDbPath)) {
    throw new Error(`ไม่พบไฟล์ฐานข้อมูลสำรองในชุด: ${backupId}`);
  }

  // 1. Verify backup DB checksum and integrity BEFORE touching current live data
  const actualBackupDbSha = computeFileSha256(backupDbPath);
  if (actualBackupDbSha !== manifest.databaseSha256) {
    throw new Error('ค่า SHA-256 ของฐานข้อมูลสำรองไม่ตรงกับ Manifest ป้องกันการทับข้อมูลที่เสียหาย');
  }

  // 2. Verify all backup storage files against manifest checksums BEFORE restoring
  for (const fileEntry of manifest.files) {
    const backupFile = path.join(backupStorageDir, ...fileEntry.relativePath.split('/'));
    if (!fs.existsSync(backupFile)) {
      throw new Error(`ไฟล์สำรองสูญหาย: ${fileEntry.relativePath}`);
    }
    const sha = computeFileSha256(backupFile);
    if (sha !== fileEntry.sha256) {
      throw new Error(`ค่า SHA-256 ของไฟล์สำรองไม่ตรงกับ Manifest: ${fileEntry.relativePath}`);
    }
  }

  // 3. Close active SQLite connection so we can safely replace the database file on Windows/macOS
  closeDb();

  // Remove stale WAL/SHM files if present
  const walFile = `${appConfig.paths.databaseFile}-wal`;
  const shmFile = `${appConfig.paths.databaseFile}-shm`;
  if (fs.existsSync(walFile)) fs.unlinkSync(walFile);
  if (fs.existsSync(shmFile)) fs.unlinkSync(shmFile);

  fs.copyFileSync(backupDbPath, appConfig.paths.databaseFile);

  // 4. Restore storage files and verify post-restore SHA-256
  for (const fileEntry of manifest.files) {
    const srcFile = path.join(backupStorageDir, ...fileEntry.relativePath.split('/'));
    const dstFile = path.join(appConfig.paths.storage, ...fileEntry.relativePath.split('/'));
    fs.mkdirSync(path.dirname(dstFile), { recursive: true });
    fs.copyFileSync(srcFile, dstFile);

    const restoredSha = computeFileSha256(dstFile);
    if (restoredSha !== fileEntry.sha256) {
      throw new Error(`การตรวจสอบหลังกู้คืนไฟล์ล้มเหลว: ${fileEntry.relativePath}`);
    }
  }

  // 5. Re-open live database and verify SQLite integrity
  const reopenedDb = getDb();
  const integrityRow = reopenedDb.prepare('PRAGMA integrity_check').get() as
    | { integrity_check: string }
    | undefined;
  const verifiedIntegrity = integrityRow?.integrity_check === 'ok';
  if (!verifiedIntegrity) {
    throw new Error('ฐานข้อมูลหลังการกู้คืนไม่ผ่านการตรวจสอบ PRAGMA integrity_check');
  }

  // Record RESTORED log in the restored database
  reopenedDb
    .prepare(
      `INSERT OR REPLACE INTO backup_logs (
        backup_id, backup_type, target_path, status, db_size_bytes,
        total_files_count, total_files_bytes, started_at, completed_at
      ) VALUES (?, ?, ?, 'RESTORED', ?, ?, ?, ?, datetime('now'))`
    )
    .run(
      manifest.backupId,
      manifest.backupType,
      backupDir,
      manifest.databaseSizeBytes,
      manifest.totalFilesCount,
      manifest.totalFilesBytes,
      manifest.createdAt
    );

  writeSystemLog({
    level: 'INFO',
    category: 'BACKUP',
    action: 'SYSTEM_RESTORED_FROM_BACKUP',
    details: {
      backupId: manifest.backupId,
      restoredFilesCount: manifest.files.length,
      restoredDbSizeBytes: manifest.databaseSizeBytes,
      verifiedIntegrity,
    },
  });

  return {
    backupId: manifest.backupId,
    restoredFilesCount: manifest.files.length,
    restoredDbSizeBytes: manifest.databaseSizeBytes,
    verifiedIntegrity,
  };
}

let scheduledBackupTask: cron.ScheduledTask | null = null;

/**
 * Starts the automatic 6-hour backup scheduler (`0 *\/6 * * *`).
 * REQ-12: ต้อง Backup ทุก 6 ชั่วโมงโดยอัตโนมัติ โดยไม่ต้องให้ Admin กด
 */
export function startAutomatedBackupScheduler(): void {
  if (scheduledBackupTask) {
    scheduledBackupTask.stop();
  }

  const expr = appConfig.backup.cronSchedule || '0 */6 * * *';
  scheduledBackupTask = cron.schedule(expr, async () => {
    await performSystemBackup('SCHEDULED_6H');
  });

  writeSystemLog({
    level: 'INFO',
    category: 'BACKUP',
    action: 'AUTOMATED_BACKUP_SCHEDULER_STARTED',
    details: { cronSchedule: expr },
  });
}

export function stopAutomatedBackupScheduler(): void {
  if (scheduledBackupTask) {
    scheduledBackupTask.stop();
    scheduledBackupTask = null;
  }
}

