import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  nodeEnv: string;
  port: number;
  host: string;
  publicBaseUrl: string;
  storageRootPath: string;
  backupRootPath: string;
  paths: {
    storage: string;
    privateStorage: string;
    publicStorage: string;
    urlStorage: string;
    databaseDir: string;
    databaseFile: string;
    backupsDir: string;
    logsDir: string;
    tempDir: string;
  };
  initialAdmin: {
    userId: string;
    name: string;
    password: string;
  };
  security: {
    sessionSecret: string;
    sessionTtlHours: number;
    maxLoginAttempts: number;
    loginLockoutMinutes: number;
  };
  line: {
    channelSecret: string;
    channelAccessToken: string;
    allowedSenderLineUserId: string;
    apiBaseUrl: string;
    dataApiBaseUrl: string;
  };
  limits: {
    maxFileSizeBytes: number;
    minFreeDiskBytes: number;
  };
  notifications: {
    groupWindowSeconds: number;
  };
  backup: {
    cronSchedule: string;
    retentionDays: number;
  };
}

function resolveStorageRoot(configuredPath?: string): string {
  const raw = (configuredPath || '').trim();

  if (raw) {
    // If running on non-Windows (e.g., macOS/Linux test machine) and .env has "D:\LINE_FILE_STORAGE"
    if (process.platform !== 'win32' && /^[a-zA-Z]:\\/.test(raw)) {
      return path.join(os.homedir(), 'LINE_FILE_STORAGE');
    }
    // On Windows, if D:\ is configured but D:\ drive does not exist, fallback cleanly to C:\LINE_FILE_STORAGE
    if (process.platform === 'win32' && /^[dD]:\\/.test(raw) && !fs.existsSync('D:\\')) {
      return raw.replace(/^[dD]:\\/, 'C:\\');
    }
    return path.resolve(raw);
  }

  if (process.platform === 'win32') {
    if (fs.existsSync('D:\\')) {
      return 'D:\\LINE_FILE_STORAGE';
    }
    return 'C:\\LINE_FILE_STORAGE';
  }

  return path.join(os.homedir(), 'LINE_FILE_STORAGE');
}

export function loadConfig(overrides?: Partial<{ storageRootPath: string; backupRootPath: string }>): AppConfig {
  const storageRootPath = resolveStorageRoot(overrides?.storageRootPath ?? process.env.STORAGE_ROOT_PATH);
  const rawBackupRoot = (overrides?.backupRootPath ?? process.env.BACKUP_ROOT_PATH ?? '').trim();
  const backupRootPath = rawBackupRoot
    ? path.resolve(rawBackupRoot)
    : path.join(storageRootPath, 'backups');

  const paths = {
    storage: path.join(storageRootPath, 'storage'),
    privateStorage: path.join(storageRootPath, 'storage', 'private'),
    publicStorage: path.join(storageRootPath, 'storage', 'public'),
    urlStorage: path.join(storageRootPath, 'storage', 'urls'),
    databaseDir: path.join(storageRootPath, 'database'),
    databaseFile: path.join(storageRootPath, 'database', 'app.sqlite'),
    backupsDir: backupRootPath,
    logsDir: path.join(storageRootPath, 'logs'),
    tempDir: path.join(storageRootPath, 'temp'),
  };

  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: Number(process.env.PORT || 3000),
    host: process.env.HOST || '0.0.0.0',
    publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
    storageRootPath,
    backupRootPath,
    paths,
    initialAdmin: {
      userId: (process.env.INITIAL_ADMIN_USER_ID || 'admin').trim(),
      name: (process.env.INITIAL_ADMIN_NAME || 'อาจารย์ผู้ดูแลระบบ').trim(),
      password: process.env.INITIAL_ADMIN_PASSWORD || 'admin',
    },
    security: {
      sessionSecret:
        process.env.SESSION_SECRET ||
        'dev_fallback_secret_please_set_in_env_file_for_production_9f8e7d6c5b4a',
      sessionTtlHours: Number(process.env.SESSION_TTL_HOURS || 12),
      maxLoginAttempts: Number(process.env.MAX_LOGIN_ATTEMPTS || 5),
      loginLockoutMinutes: Number(process.env.LOGIN_LOCKOUT_MINUTES || 15),
    },
    line: {
      channelSecret: (process.env.LINE_CHANNEL_SECRET || '').trim(),
      channelAccessToken: (process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim(),
      allowedSenderLineUserId: (process.env.ALLOWED_SENDER_LINE_USER_ID || '').trim(),
      apiBaseUrl: (process.env.LINE_API_BASE_URL || 'https://api.line.me').replace(/\/+$/, ''),
      dataApiBaseUrl: (process.env.LINE_DATA_API_BASE_URL || 'https://api-data.line.me').replace(/\/+$/, ''),
    },
    limits: {
      maxFileSizeBytes: Number(process.env.MAX_FILE_SIZE_BYTES || 300 * 1024 * 1024), // 300 MB default
      minFreeDiskBytes: Number(process.env.MIN_FREE_DISK_BYTES || 1024 * 1024 * 1024), // 1 GB default
    },
    notifications: {
      groupWindowSeconds: Number(process.env.NOTIFICATION_GROUP_WINDOW_SECONDS || 120),
    },
    backup: {
      cronSchedule: process.env.BACKUP_CRON_SCHEDULE || '0 */6 * * *',
      retentionDays: Number(process.env.BACKUP_RETENTION_DAYS || 0),
    },
  };
}

export function ensureStorageDirectories(config: AppConfig): void {
  const dirs = [
    config.storageRootPath,
    config.paths.storage,
    config.paths.privateStorage,
    config.paths.publicStorage,
    config.paths.urlStorage,
    config.paths.databaseDir,
    config.paths.backupsDir,
    config.paths.logsDir,
    config.paths.tempDir,
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export const appConfig = loadConfig();

