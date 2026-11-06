import fs from 'node:fs';
import path from 'node:path';

export interface DiskSpaceInfo {
  freeBytes: number;
  totalBytes: number;
  usedBytes: number;
}

/**
 * Checks real available disk space on the filesystem hosting targetPath.
 * REQ-09: ต้องตรวจสอบพื้นที่ว่างของ Disk ก่อนจัดเก็บ
 */
export function getDiskSpaceInfo(targetPath: string): DiskSpaceInfo {
  const resolved = path.resolve(targetPath);
  const checkDir = fs.existsSync(resolved) ? resolved : path.dirname(resolved);
  const stats = fs.statfsSync(checkDir);
  const freeBytes = Number(stats.bavail) * Number(stats.bsize);
  const totalBytes = Number(stats.blocks) * Number(stats.bsize);
  const usedBytes = Math.max(0, totalBytes - freeBytes);
  return { freeBytes, totalBytes, usedBytes };
}

/**
 * Sanitizes original display filenames so they cannot contain control characters
 * or path separators while preserving Thai and international characters.
 * REQ-10 & Section 8: File Name Sanitization
 */
export function sanitizeDisplayFileName(rawName: string): string {
  const base = rawName
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/]/g, '_')
    .trim();
  if (!base || base === '.' || base === '..') {
    return 'unnamed_file';
  }
  return base.slice(0, 255);
}

/**
 * Safely sanitizes a User ID for folder naming (prevents Path Traversal).
 */
export function sanitizeUserFolderId(userId: string): string {
  const cleaned = userId.replace(/[^a-zA-Z0-9_-]/g, '_').trim();
  if (!cleaned || cleaned.includes('..')) {
    throw new Error('Invalid User ID for storage directory');
  }
  return cleaned;
}

/**
 * Strictly resolves a path within baseDir and throws if Path Traversal is attempted.
 * REQ-10 & Section 8: Path Traversal Protection
 */
export function resolveSafeStoragePath(baseDir: string, relativeTarget: string): string {
  const normalizedBase = path.resolve(baseDir);
  // Reject null bytes or explicit parent directory traversal tokens
  if (relativeTarget.includes('\0')) {
    throw new Error('Path traversal detected: null byte');
  }
  const normalizedTarget = path.resolve(normalizedBase, relativeTarget);
  const rel = path.relative(normalizedBase, normalizedTarget);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Path traversal detected: target escapes storage root');
  }
  return normalizedTarget;
}

