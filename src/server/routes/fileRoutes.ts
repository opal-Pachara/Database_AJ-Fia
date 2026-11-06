import fs from 'node:fs';
import { Router, Request, Response } from 'express';
import { getDb } from '../db/connection.js';
import { appConfig } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import { resolveSafeStoragePath } from '../utils/disk.js';
import { writeSystemLog } from '../utils/logger.js';

export const fileRouter = Router();

interface FileRow {
  id: number;
  file_uuid: string;
  original_name: string;
  stored_filename: string;
  relative_storage_path: string;
  mime_type: string;
  file_extension: string;
  file_category: string;
  file_size_bytes: number;
  attached_message: string | null;
  visibility: 'PRIVATE' | 'PUBLIC';
  is_previewable: number;
  received_at: string;
}

/**
 * Helper to strictly verify whether an authenticated user has permission to access a given file.
 * Section 8: กฎสำคัญที่สุด: User ต้องไม่สามารถเปิดไฟล์ของ User คนอื่นได้โดยการแก้ URL หรือเปลี่ยน File ID เอง
 * ทุกครั้งที่มีการ Preview หรือ Download ต้องตรวจสอบสิทธิ์ฝั่ง Backend ใหม่เสมอ
 */
function canUserAccessFile(
  userPk: number,
  userId: string,
  role: 'USER' | 'ADMIN',
  fileRow: FileRow
): boolean {
  if (role === 'ADMIN') {
    return true;
  }
  if (fileRow.visibility === 'PUBLIC') {
    return true;
  }
  const db = getDb();
  const grant = db
    .prepare(
      `SELECT id FROM file_recipients
       WHERE file_pk = ? AND (user_pk = ? OR recipient_user_id = ?)
       LIMIT 1`
    )
    .get(fileRow.id, userPk, userId) as { id: number } | undefined;

  return Boolean(grant);
}

/**
 * GET /api/files
 * REQ-07, REQ-16: หน้าแสดงรายการไฟล์ + ระบบค้นหาไฟล์ + ตัวกรองวันที่/หมวดหมู่/พื้นที่จัดเก็บ
 */
fileRouter.get('/', requireAuth(), (req: Request, res: Response) => {
  const user = req.authUser!;
  const db = getDb();

  const q = String(req.query.q || '').trim();
  const visibility = String(req.query.visibility || 'ALL').toUpperCase();
  const category = String(req.query.category || 'ALL').toUpperCase();
  const dateFrom = String(req.query.dateFrom || '').trim();
  const dateTo = String(req.query.dateTo || '').trim();

  const conditions: string[] = [`f.status = 'ACTIVE'`];
  const params: Array<string | number> = [];

  // Strict authorization filter: users only see their own PRIVATE files or PUBLIC files
  if (visibility === 'PRIVATE') {
    conditions.push(
      `f.visibility = 'PRIVATE' AND EXISTS (
        SELECT 1 FROM file_recipients fr
        WHERE fr.file_pk = f.id AND (fr.user_pk = ? OR fr.recipient_user_id = ?)
      )`
    );
    params.push(user.id, user.userId);
  } else if (visibility === 'PUBLIC') {
    conditions.push(`f.visibility = 'PUBLIC'`);
  } else {
    conditions.push(
      `(f.visibility = 'PUBLIC' OR (
        f.visibility = 'PRIVATE' AND EXISTS (
          SELECT 1 FROM file_recipients fr
          WHERE fr.file_pk = f.id AND (fr.user_pk = ? OR fr.recipient_user_id = ?)
        )
      ))`
    );
    params.push(user.id, user.userId);
  }

  // Category filter (REQ-07 & REQ-16)
  if (
    category !== 'ALL' &&
    ['PDF', 'IMAGE', 'DOCUMENT', 'VIDEO', 'AUDIO', 'ARCHIVE', 'OTHER'].includes(category)
  ) {
    conditions.push(`f.file_category = ?`);
    params.push(category);
  }

  // Search query: filename or attached message (REQ-16)
  if (q) {
    conditions.push(
      `(LOWER(f.original_name) LIKE LOWER(?) OR LOWER(COALESCE(f.attached_message, '')) LIKE LOWER(?))`
    );
    const pattern = `%${q}%`;
    params.push(pattern, pattern);
  }

  // Date range filter (REQ-07 & REQ-16)
  if (dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
    conditions.push(`f.received_at >= ?`);
    params.push(`${dateFrom}T00:00:00.000Z`);
  }
  if (dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    conditions.push(`f.received_at <= ?`);
    params.push(`${dateTo}T23:59:59.999Z`);
  }

  const sql = `
    SELECT
      f.file_uuid AS fileUuid,
      f.original_name AS originalName,
      f.mime_type AS mimeType,
      f.file_extension AS fileExtension,
      f.file_category AS fileCategory,
      f.file_size_bytes AS fileSizeBytes,
      f.attached_message AS attachedMessage,
      f.visibility AS visibility,
      f.is_previewable AS isPreviewable,
      f.received_at AS receivedAt,
      (
        SELECT GROUP_CONCAT(
          CASE
            WHEN u.line_aliases IS NOT NULL AND u.line_aliases != '' THEN u.line_aliases || ' (' || u.full_name || ')'
            WHEN u.full_name IS NOT NULL AND u.full_name != '' THEN u.full_name
            ELSE fr.recipient_user_id
          END,
          ', '
        )
        FROM file_recipients fr
        LEFT JOIN users u ON u.id = fr.user_pk
        WHERE fr.file_pk = f.id
      ) AS recipientUserIds
    FROM files f
    WHERE ${conditions.join(' AND ')}
    ORDER BY f.received_at DESC, f.id DESC
  `;

  const rows = db.prepare(sql).all(...params) as Array<{
    fileUuid: string;
    originalName: string;
    mimeType: string;
    fileExtension: string;
    fileCategory: string;
    fileSizeBytes: number;
    attachedMessage: string | null;
    visibility: 'PRIVATE' | 'PUBLIC';
    isPreviewable: number;
    receivedAt: string;
    recipientUserIds: string | null;
  }>;

  // Compute summary stats for User Dashboard (Section 10.2)
  const privateCountRow = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM files f
       WHERE f.status = 'ACTIVE' AND f.visibility = 'PRIVATE'
         AND EXISTS (
           SELECT 1 FROM file_recipients fr
           WHERE fr.file_pk = f.id AND (fr.user_pk = ? OR fr.recipient_user_id = ?)
         )`
    )
    .get(user.id, user.userId) as { cnt: number };

  const publicCountRow = db
    .prepare(`SELECT COUNT(*) AS cnt FROM files WHERE status = 'ACTIVE' AND visibility = 'PUBLIC'`)
    .get() as { cnt: number };

  const urlCountRow = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM url_records u
       WHERE u.status = 'ACTIVE'
         AND (u.visibility = 'PUBLIC' OR EXISTS (
           SELECT 1 FROM url_recipients ur
           WHERE ur.url_pk = u.id AND (ur.user_pk = ? OR ur.recipient_user_id = ?)
         ))`
    )
    .get(user.id, user.userId) as { cnt: number };

  res.json({
    files: rows.map((r) => ({
      ...r,
      isPreviewable: r.isPreviewable === 1,
    })),
    summary: {
      privateCount: privateCountRow.cnt,
      publicCount: publicCountRow.cnt,
      totalFilesCount: privateCountRow.cnt + publicCountRow.cnt,
      urlCount: urlCountRow.cnt,
    },
  });
});

/**
 * GET /api/files/urls
 * REQ-14: แสดง URL บนเว็บไซต์ พร้อมข้อความที่เกี่ยวข้อง และวันที่ได้รับ
 */
fileRouter.get('/urls', requireAuth(), (req: Request, res: Response) => {
  const user = req.authUser!;
  const db = getDb();

  const q = String(req.query.q || '').trim();
  const visibility = String(req.query.visibility || 'ALL').toUpperCase();
  const dateFrom = String(req.query.dateFrom || '').trim();
  const dateTo = String(req.query.dateTo || '').trim();

  const conditions: string[] = [`u.status = 'ACTIVE'`];
  const params: Array<string | number> = [];

  if (visibility === 'PRIVATE') {
    conditions.push(
      `u.visibility = 'PRIVATE' AND EXISTS (
        SELECT 1 FROM url_recipients ur
        WHERE ur.url_pk = u.id AND (ur.user_pk = ? OR ur.recipient_user_id = ?)
      )`
    );
    params.push(user.id, user.userId);
  } else if (visibility === 'PUBLIC') {
    conditions.push(`u.visibility = 'PUBLIC'`);
  } else {
    conditions.push(
      `(u.visibility = 'PUBLIC' OR (
        u.visibility = 'PRIVATE' AND EXISTS (
          SELECT 1 FROM url_recipients ur
          WHERE ur.url_pk = u.id AND (ur.user_pk = ? OR ur.recipient_user_id = ?)
        )
      ))`
    );
    params.push(user.id, user.userId);
  }

  if (q) {
    conditions.push(
      `(LOWER(u.url) LIKE LOWER(?) OR LOWER(COALESCE(u.attached_message, '')) LIKE LOWER(?))`
    );
    const pattern = `%${q}%`;
    params.push(pattern, pattern);
  }

  if (dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
    conditions.push(`u.received_at >= ?`);
    params.push(`${dateFrom}T00:00:00.000Z`);
  }
  if (dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    conditions.push(`u.received_at <= ?`);
    params.push(`${dateTo}T23:59:59.999Z`);
  }

  const sql = `
    SELECT
      u.url_uuid AS urlUuid,
      u.url AS url,
      u.attached_message AS attachedMessage,
      u.visibility AS visibility,
      u.received_at AS receivedAt
    FROM url_records u
    WHERE ${conditions.join(' AND ')}
    ORDER BY u.received_at DESC, u.id DESC
  `;

  const urls = db.prepare(sql).all(...params);
  res.json({ urls });
});

/**
 * GET /api/files/:fileUuid/preview
 * REQ-15: ระบบต้องรองรับการ Preview เฉพาะ PDF และรูปภาพ และตรวจสอบสิทธิ์ก่อนเปิด Preview ทุกครั้ง
 */
fileRouter.get('/:fileUuid/preview', requireAuth(), (req: Request, res: Response) => {
  const user = req.authUser!;
  const fileUuid = String(req.params.fileUuid || '').trim();

  if (!/^[0-9a-fA-F-]{36}$/.test(fileUuid)) {
    res.status(400).json({ error: 'รหัสไฟล์ไม่ถูกต้อง' });
    return;
  }

  const db = getDb();
  const fileRow = db
    .prepare(
      `SELECT id, file_uuid, original_name, stored_filename, relative_storage_path,
              mime_type, file_extension, file_category, file_size_bytes,
              attached_message, visibility, is_previewable, received_at
       FROM files
       WHERE file_uuid = ? AND status = 'ACTIVE'`
    )
    .get(fileUuid) as FileRow | undefined;

  if (!fileRow) {
    res.status(404).json({ error: 'ไม่พบไฟล์ที่ต้องการ' });
    return;
  }

  // Strict Backend Authorization Check (Section 8)
  if (!canUserAccessFile(user.id, user.userId, user.role, fileRow)) {
    writeSystemLog({
      level: 'SECURITY',
      category: 'FILE',
      action: 'UNAUTHORIZED_FILE_PREVIEW_BLOCKED',
      actorUserId: user.userId,
      ipAddress: req.ip,
      details: { fileUuid, originalName: fileRow.original_name },
    });
    res.status(403).json({ error: 'คุณไม่มีสิทธิ์เข้าถึงไฟล์นี้ (Access Denied)' });
    return;
  }

  // รองรับการแสดงตัวอย่าง (Preview) สำหรับ PDF, รูปภาพ (IMAGE), วิดีโอ (VIDEO), และไฟล์เสียง (AUDIO)
  // ส่วนไฟล์ประเภท DOCUMENT (.docx/.xlsx), ARCHIVE (.zip) ที่เบราว์เซอร์ไม่รองรับจะคืนค่า 415
  if (
    fileRow.is_previewable !== 1 ||
    !['PDF', 'IMAGE', 'VIDEO', 'AUDIO'].includes(fileRow.file_category)
  ) {
    res.status(415).json({
      error: 'ไฟล์ประเภทนี้ไม่รองรับการแสดงตัวอย่าง (Preview) กรุณากดดาวน์โหลดแทน',
    });
    return;
  }

  try {
    const absPath = resolveSafeStoragePath(appConfig.paths.storage, fileRow.relative_storage_path);
    if (!fs.existsSync(absPath)) {
      res.status(404).json({ error: 'ไม่พบไฟล์บนพื้นที่จัดเก็บข้อมูลของ Server' });
      return;
    }

    const stat = fs.statSync(absPath);
    const totalSize = stat.size;

    let contentType = fileRow.mime_type || 'application/octet-stream';
    if (fileRow.file_category === 'PDF') contentType = 'application/pdf';
    else if (
      fileRow.file_category === 'IMAGE' &&
      (!contentType.startsWith('image/') || contentType === 'application/octet-stream')
    ) {
      contentType =
        fileRow.file_extension === 'png'
          ? 'image/png'
          : fileRow.file_extension === 'gif'
          ? 'image/gif'
          : fileRow.file_extension === 'webp'
          ? 'image/webp'
          : 'image/jpeg';
    } else if (
      fileRow.file_category === 'VIDEO' &&
      (!contentType.startsWith('video/') || contentType === 'application/octet-stream')
    ) {
      contentType = fileRow.file_extension === 'mov' ? 'video/quicktime' : 'video/mp4';
    } else if (
      fileRow.file_category === 'AUDIO' &&
      (!contentType.startsWith('audio/') || contentType === 'application/octet-stream')
    ) {
      contentType = fileRow.file_extension === 'mp3' ? 'audio/mpeg' : 'audio/mp4';
    }

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(fileRow.original_name)}`
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Support HTTP Byte-Range Requests (206 Partial Content) required by iPhone / iPad Safari for Video, Audio, and PDF streaming
    const rangeHeader = req.headers.range;
    if (rangeHeader && totalSize > 0) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (isNaN(start) || isNaN(end) || start >= totalSize || end >= totalSize || start > end) {
        res.status(416);
        res.setHeader('Content-Range', `bytes */${totalSize}`);
        res.end();
        return;
      }

      const chunkSize = end - start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
      res.setHeader('Content-Length', String(chunkSize));
      res.setHeader('Content-Type', contentType);

      const stream = fs.createReadStream(absPath, { start, end });
      stream.pipe(res);
      return;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(totalSize));

    const stream = fs.createReadStream(absPath);
    stream.pipe(res);
  } catch (err) {
    res.status(400).json({ error: 'ไม่สามารถเปิดไฟล์ได้' });
  }
});

/**
 * GET /api/files/:fileUuid/download
 * REQ-07, REQ-10, Section 8: ดาวน์โหลดไฟล์จริง พร้อมตรวจสอบสิทธิ์ฝั่ง Backend ทุกครั้ง
 */
fileRouter.get('/:fileUuid/download', requireAuth(), (req: Request, res: Response) => {
  const user = req.authUser!;
  const fileUuid = String(req.params.fileUuid || '').trim();

  if (!/^[0-9a-fA-F-]{36}$/.test(fileUuid)) {
    res.status(400).json({ error: 'รหัสไฟล์ไม่ถูกต้อง' });
    return;
  }

  const db = getDb();
  const fileRow = db
    .prepare(
      `SELECT id, file_uuid, original_name, stored_filename, relative_storage_path,
              mime_type, file_extension, file_category, file_size_bytes,
              attached_message, visibility, is_previewable, received_at
       FROM files
       WHERE file_uuid = ? AND status = 'ACTIVE'`
    )
    .get(fileUuid) as FileRow | undefined;

  if (!fileRow) {
    res.status(404).json({ error: 'ไม่พบไฟล์ที่ต้องการ' });
    return;
  }

  // Strict Backend Authorization Check (Section 8)
  if (!canUserAccessFile(user.id, user.userId, user.role, fileRow)) {
    writeSystemLog({
      level: 'SECURITY',
      category: 'FILE',
      action: 'UNAUTHORIZED_FILE_DOWNLOAD_BLOCKED',
      actorUserId: user.userId,
      ipAddress: req.ip,
      details: { fileUuid, originalName: fileRow.original_name },
    });
    res.status(403).json({ error: 'คุณไม่มีสิทธิ์ดาวน์โหลดไฟล์นี้ (Access Denied)' });
    return;
  }

  try {
    const absPath = resolveSafeStoragePath(appConfig.paths.storage, fileRow.relative_storage_path);
    if (!fs.existsSync(absPath)) {
      res.status(404).json({ error: 'ไม่พบไฟล์จริงบนพื้นที่จัดเก็บข้อมูลของ Server' });
      return;
    }

    writeSystemLog({
      level: 'INFO',
      category: 'FILE',
      action: 'FILE_DOWNLOADED',
      actorUserId: user.userId,
      ipAddress: req.ip,
      details: { fileUuid, originalName: fileRow.original_name },
    });

    res.setHeader('Content-Type', fileRow.mime_type || 'application/octet-stream');
    res.setHeader('Content-Length', String(fileRow.file_size_bytes));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(fileRow.original_name)}`
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const stream = fs.createReadStream(absPath);
    stream.pipe(res);
  } catch (err) {
    res.status(400).json({ error: 'ไม่สามารถดาวน์โหลดไฟล์ได้' });
  }
});

