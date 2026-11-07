import fs from 'node:fs';
import path from 'node:path';
import { Router, Request, Response } from 'express';
import { getDb, runInTransaction } from '../db/connection.js';
import { appConfig } from '../config.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { hashPassword } from '../utils/password.js';
import {
  getDiskSpaceInfo,
  resolveSafeStoragePath,
  sanitizeUserFolderId,
} from '../utils/disk.js';
import {
  performSystemBackup,
  restoreSystemFromBackup,
} from '../services/backupService.js';
import { createNotificationsForIncomingItem } from '../services/notificationService.js';
import { broadcastRealtimeEvent } from '../services/realtimeEvents.js';
import { writeSystemLog } from '../utils/logger.js';

export const adminRouter = Router();

// All routes in adminRouter require authenticated ADMIN user
adminRouter.use(requireAuth(), requireAdmin);

/**
 * GET /api/admin/users
 * REQ-05: แสดงรายการบัญชีผู้ใช้งานทั้งหมด
 */
adminRouter.get('/users', (_req: Request, res: Response) => {
  const db = getDb();
  const users = db
    .prepare(
      `SELECT
        u.id,
        u.user_id AS userId,
        u.full_name AS fullName,
        COALESCE(u.line_aliases, '') AS lineAliases,
        u.role,
        u.status,
        u.must_change_password AS mustChangePassword,
        u.failed_login_attempts AS failedLoginAttempts,
        u.locked_until AS lockedUntil,
        u.created_at AS createdAt,
        u.updated_at AS updatedAt,
        (
          SELECT COUNT(*)
          FROM file_recipients fr
          JOIN files f ON f.id = fr.file_pk
          WHERE (fr.user_pk = u.id OR fr.recipient_user_id = u.user_id)
            AND f.status = 'ACTIVE'
        ) AS privateFileCount
       FROM users u
       ORDER BY u.role ASC, u.user_id ASC`
    )
    .all() as Array<Record<string, unknown>>;

  res.json({
    users: users.map((u) => ({
      ...u,
      mustChangePassword: u.mustChangePassword === 1,
    })),
  });
});

/**
 * POST /api/admin/users
 * REQ-05 & REQ-06: เพิ่ม User ใหม่ (Password เริ่มต้นเหมือนกับ User ID หากไม่ได้ระบุเป็นอย่างอื่น และบังคับเปลี่ยนเมื่อ Login ครั้งแรก)
 */
adminRouter.post('/users', async (req: Request, res: Response) => {
  try {
    const admin = req.authUser!;
    const userId = String(req.body?.userId || '').trim();
    const fullName = String(req.body?.fullName || '').trim();
    const lineAliases = String(req.body?.lineAliases || '').trim();
    const customPassword = String(req.body?.password || '').trim();
    const status = String(req.body?.status || 'ACTIVE').toUpperCase();

    if (!userId || !fullName) {
      res.status(400).json({ error: 'กรุณากรอก User ID และชื่อผู้ใช้งานให้ครบถ้วน' });
      return;
    }

    if (!/^[a-zA-Z0-9_.-]{2,64}$/.test(userId)) {
      res.status(400).json({
        error: 'User ID ต้องประกอบด้วยตัวอักษรภาษาอังกฤษ ตัวเลข หรือ _ . - ความยาว 2-64 ตัวอักษร',
      });
      return;
    }

    if (!['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(status)) {
      res.status(400).json({ error: 'สถานะบัญชีไม่ถูกต้อง' });
      return;
    }

    const db = getDb();
    const exists = db.prepare('SELECT id FROM users WHERE user_id = ?').get(userId);
    if (exists) {
      res.status(409).json({ error: `User ID "${userId}" มีอยู่ในระบบแล้ว` });
      return;
    }

    // REQ-06: Password เริ่มต้นของผู้ใช้งานเหมือนกับ User ID (เว้นแต่ Admin กำหนดค่าเริ่มต้นมาให้)
    const initialPassword = customPassword || userId;
    const passwordHash = await hashPassword(initialPassword);

    const insertRes = db
      .prepare(
        `INSERT INTO users (
          user_id, full_name, line_aliases, password_hash, role, status, must_change_password, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'USER', ?, 1, datetime('now'), datetime('now'))`
      )
      .run(userId, fullName, lineAliases, passwordHash, status);

    const newUserPk = Number(insertRes.lastInsertRowid);

    // Ensure private storage folder for this user exists
    const userFolder = sanitizeUserFolderId(userId);
    const userDir = resolveSafeStoragePath(appConfig.paths.privateStorage, userFolder);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }

    // Re-link any orphaned files that previously belonged to this user_id
    db.prepare(
      `UPDATE file_recipients SET user_pk = ? WHERE recipient_user_id = ? AND user_pk IS NULL`
    ).run(newUserPk, userId);

    writeSystemLog({
      level: 'INFO',
      category: 'ADMIN',
      action: 'USER_CREATED',
      actorUserId: admin.userId,
      ipAddress: req.ip,
      details: { targetUserId: userId, fullName, lineAliases, status },
    });

    res.status(201).json({
      user: {
        id: newUserPk,
        userId,
        fullName,
        lineAliases,
        role: 'USER',
        status,
        mustChangePassword: true,
      },
    });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเพิ่มผู้ใช้งาน' });
  }
});

/**
 * PUT /api/admin/users/:id
 * REQ-05: แก้ไขข้อมูล User (ชื่อ, รหัสผ่าน, สถานะบัญชี)
 */
adminRouter.put('/users/:id', async (req: Request, res: Response) => {
  try {
    const admin = req.authUser!;
    const targetPk = Number(req.params.id);
    const fullName = String(req.body?.fullName || '').trim();
    const lineAliases =
      req.body?.lineAliases !== undefined ? String(req.body.lineAliases).trim() : undefined;
    const newPassword = String(req.body?.password || '').trim();
    const status = String(req.body?.status || '').toUpperCase();

    const db = getDb();
    const targetUser = db
      .prepare('SELECT id, user_id, role, status, COALESCE(line_aliases, \'\') AS line_aliases FROM users WHERE id = ?')
      .get(targetPk) as
      | { id: number; user_id: string; role: 'USER' | 'ADMIN'; status: string; line_aliases: string }
      | undefined;

    if (!targetUser) {
      res.status(404).json({ error: 'ไม่พบบัญชีผู้ใช้งานที่ต้องการแก้ไข' });
      return;
    }

    if (!fullName) {
      res.status(400).json({ error: 'กรุณาระบุชื่อผู้ใช้งาน' });
      return;
    }

    const finalStatus = ['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(status)
      ? status
      : targetUser.status;
    const finalAliases = lineAliases !== undefined ? lineAliases : targetUser.line_aliases;

    if (targetUser.id === admin.id && finalStatus !== 'ACTIVE') {
      res.status(400).json({ error: 'ไม่สามารถระงับหรือปิดใช้งานบัญชี Admin ของตนเองได้' });
      return;
    }

    if (newPassword) {
      const passwordHash = await hashPassword(newPassword);
      // Force password change on next login if Admin resets password for a USER
      const mustChange = targetUser.role === 'USER' ? 1 : 0;
      db.prepare(
        `UPDATE users
         SET full_name = ?,
             line_aliases = ?,
             password_hash = ?,
             status = ?,
             must_change_password = ?,
             failed_login_attempts = 0,
             locked_until = NULL,
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(fullName, finalAliases, passwordHash, finalStatus, mustChange, targetPk);
    } else {
      db.prepare(
        `UPDATE users
         SET full_name = ?,
             line_aliases = ?,
             status = ?,
             failed_login_attempts = CASE WHEN ? = 'ACTIVE' THEN 0 ELSE failed_login_attempts END,
             locked_until = CASE WHEN ? = 'ACTIVE' THEN NULL ELSE locked_until END,
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(fullName, finalAliases, finalStatus, finalStatus, finalStatus, targetPk);
    }

    if (finalStatus !== 'ACTIVE') {
      db.prepare('DELETE FROM sessions WHERE user_pk = ?').run(targetPk);
    }

    writeSystemLog({
      level: 'INFO',
      category: 'ADMIN',
      action: 'USER_UPDATED',
      actorUserId: admin.userId,
      ipAddress: req.ip,
      details: {
        targetUserId: targetUser.user_id,
        fullName,
        status: finalStatus,
        passwordReset: Boolean(newPassword),
      },
    });

    res.json({
      ok: true,
      user: {
        id: targetPk,
        userId: targetUser.user_id,
        fullName,
        lineAliases: finalAliases,
        status: finalStatus,
      },
    });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการแก้ไขข้อมูลผู้ใช้งาน' });
  }
});

/**
 * PATCH /api/admin/users/:id/status
 * REQ-05: เปิดใช้งานบัญชี (ACTIVE) / ปิดใช้งาน (INACTIVE) / ระงับบัญชี (SUSPENDED)
 */
adminRouter.patch('/users/:id/status', (req: Request, res: Response) => {
  const admin = req.authUser!;
  const targetPk = Number(req.params.id);
  const status = String(req.body?.status || '').toUpperCase();

  if (!['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(status)) {
    res.status(400).json({ error: 'สถานะบัญชีต้องเป็น ACTIVE, INACTIVE หรือ SUSPENDED เท่านั้น' });
    return;
  }

  const db = getDb();
  const targetUser = db
    .prepare('SELECT id, user_id, role FROM users WHERE id = ?')
    .get(targetPk) as { id: number; user_id: string; role: string } | undefined;

  if (!targetUser) {
    res.status(404).json({ error: 'ไม่พบบัญชีผู้ใช้งาน' });
    return;
  }

  if (targetUser.id === admin.id && status !== 'ACTIVE') {
    res.status(400).json({ error: 'ไม่สามารถระงับบัญชี Admin ที่กำลังใช้งานอยู่ได้' });
    return;
  }

  db.prepare(
    `UPDATE users
     SET status = ?,
         failed_login_attempts = CASE WHEN ? = 'ACTIVE' THEN 0 ELSE failed_login_attempts END,
         locked_until = CASE WHEN ? = 'ACTIVE' THEN NULL ELSE locked_until END,
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(status, status, status, targetPk);

  // Immediately terminate active sessions if user is deactivated or suspended
  if (status !== 'ACTIVE') {
    db.prepare('DELETE FROM sessions WHERE user_pk = ?').run(targetPk);
  }

  writeSystemLog({
    level: 'INFO',
    category: 'ADMIN',
    action: 'USER_STATUS_CHANGED',
    actorUserId: admin.userId,
    ipAddress: req.ip,
    details: { targetUserId: targetUser.user_id, newStatus: status },
  });

  res.json({ ok: true, status });
});

/**
 * DELETE /api/admin/users/:id
 * REQ-05: ลบบัญชี (การลบบัญชีต้องไม่ทำให้ไฟล์ของผู้ใช้งานถูกลบโดยอัตโนมัติ เว้นแต่ Admin จะสั่งลบไฟล์แยกต่างหาก)
 */
adminRouter.delete('/users/:id', (req: Request, res: Response) => {
  const admin = req.authUser!;
  const targetPk = Number(req.params.id);
  const db = getDb();

  const targetUser = db
    .prepare('SELECT id, user_id, role FROM users WHERE id = ?')
    .get(targetPk) as { id: number; user_id: string; role: string } | undefined;

  if (!targetUser) {
    res.status(404).json({ error: 'ไม่พบบัญชีผู้ใช้งาน' });
    return;
  }

  if (targetUser.id === admin.id || targetUser.role === 'ADMIN') {
    res.status(400).json({ error: 'ไม่สามารถลบบัญชีผู้ดูแลระบบ (Admin) ได้' });
    return;
  }

  runInTransaction(db, () => {
    // Detach user_pk in file_recipients & url_recipients while keeping recipient_user_id and the files intact!
    db.prepare('UPDATE file_recipients SET user_pk = NULL WHERE user_pk = ?').run(targetPk);
    db.prepare('UPDATE url_recipients SET user_pk = NULL WHERE user_pk = ?').run(targetPk);
    db.prepare('DELETE FROM sessions WHERE user_pk = ?').run(targetPk);
    db.prepare('DELETE FROM users WHERE id = ?').run(targetPk);
  });

  writeSystemLog({
    level: 'INFO',
    category: 'ADMIN',
    action: 'USER_DELETED_FILES_PRESERVED',
    actorUserId: admin.userId,
    ipAddress: req.ip,
    details: { deletedUserId: targetUser.user_id },
  });

  res.json({
    ok: true,
    message: `ลบบัญชี ${targetUser.user_id} เรียบร้อยแล้ว (ไฟล์ทั้งหมดของผู้ใช้งานยังคงถูกเก็บรักษาไว้ในระบบตาม REQ-05)`,
  });
});

/**
 * GET /api/admin/files
 * Section 3 & REQ-05 & REQ-10: Admin ดูและควบคุมไฟล์ทั้งหมดในระบบ (รวมถึงไฟล์ของ User ที่ถูกลบบัญชีไปแล้ว)
 */
adminRouter.get('/files', (_req: Request, res: Response) => {
  const db = getDb();
  const files = db
    .prepare(
      `SELECT
        f.file_uuid AS fileUuid,
        f.original_name AS originalName,
        f.stored_filename AS storedFilename,
        f.relative_storage_path AS relativeStoragePath,
        f.mime_type AS mimeType,
        f.file_extension AS fileExtension,
        f.file_category AS fileCategory,
        f.file_size_bytes AS fileSizeBytes,
        f.sha256_checksum AS sha256Checksum,
        f.attached_message AS attachedMessage,
        COALESCE(f.uploader_name, 'อาจารย์ผู้ส่งไฟล์ (LINE OA)') AS uploaderName,
        f.uploader_picture_url AS uploaderPictureUrl,
        f.uploader_line_user_id AS uploaderLineUserId,
        f.visibility,
        f.is_previewable AS isPreviewable,
        f.received_at AS receivedAt,
        (
          SELECT GROUP_CONCAT(fr.recipient_user_id, ', ')
          FROM file_recipients fr
          WHERE fr.file_pk = f.id
        ) AS recipientUserIds
       FROM files f
       WHERE f.status = 'ACTIVE'
       ORDER BY f.received_at DESC, f.id DESC`
    )
    .all() as Array<Record<string, unknown>>;

  res.json({
    files: files.map((f) => ({
      ...f,
      isPreviewable: f.isPreviewable === 1,
    })),
  });
});

/**
 * DELETE /api/admin/files/:fileUuid
 * REQ-05 & REQ-10: ไฟล์จะถูกเก็บไว้จนกว่า Admin จะลบเอง
 */
adminRouter.delete('/files/:fileUuid', (req: Request, res: Response) => {
  const admin = req.authUser!;
  const fileUuid = String(req.params.fileUuid || '').trim();
  const db = getDb();

  const fileRow = db
    .prepare(
      `SELECT id, original_name, relative_storage_path FROM files WHERE file_uuid = ? AND status = 'ACTIVE'`
    )
    .get(fileUuid) as
    | { id: number; original_name: string; relative_storage_path: string }
    | undefined;

  if (!fileRow) {
    res.status(404).json({ error: 'ไม่พบไฟล์ที่ต้องการลบ' });
    return;
  }

  try {
    const absPath = resolveSafeStoragePath(appConfig.paths.storage, fileRow.relative_storage_path);
    if (fs.existsSync(absPath)) {
      fs.unlinkSync(absPath);
    }
  } catch {
    // Ignore physical unlink error if already missing
  }

  runInTransaction(db, () => {
    db.prepare(`UPDATE files SET status = 'DELETED' WHERE id = ?`).run(fileRow.id);
    db.prepare(`DELETE FROM notifications WHERE file_pk = ?`).run(fileRow.id);
  });

  writeSystemLog({
    level: 'INFO',
    category: 'ADMIN',
    action: 'FILE_DELETED_BY_ADMIN',
    actorUserId: admin.userId,
    ipAddress: req.ip,
    details: { fileUuid, originalName: fileRow.original_name },
  });

  broadcastRealtimeEvent({
    type: 'FILE_DELETED',
    itemUuid: fileUuid,
    title: fileRow.original_name,
    visibility: 'PUBLIC',
    recipientUserIds: [],
    timestamp: new Date().toISOString(),
  });

  res.json({ ok: true });
});

/**
 * POST /api/admin/files/bulk-delete
 * ลบไฟล์แบบเลือกหลายรายการพร้อมกัน (Multi-select) หรือลบไฟล์ทั้งหมดในระบบ (Delete All)
 */
adminRouter.post('/files/bulk-delete', (req: Request, res: Response) => {
  const admin = req.authUser!;
  const deleteAll = Boolean(req.body?.deleteAll);
  const rawUuids = Array.isArray(req.body?.fileUuids) ? req.body.fileUuids : [];
  const fileUuids: string[] = Array.from(
    new Set<string>(rawUuids.map((u: unknown) => String(u || '').trim()).filter(Boolean))
  );

  const db = getDb();

  let targetRows: Array<{
    id: number;
    file_uuid: string;
    original_name: string;
    relative_storage_path: string;
  }> = [];

  if (deleteAll) {
    targetRows = db
      .prepare(
        `SELECT id, file_uuid, original_name, relative_storage_path
         FROM files
         WHERE status = 'ACTIVE'`
      )
      .all() as unknown as typeof targetRows;
  } else {
    if (fileUuids.length === 0) {
      res.status(400).json({ error: 'กรุณาเลือกไฟล์ที่ต้องการลบอย่างน้อย 1 รายการ' });
      return;
    }
    const placeholders = fileUuids.map(() => '?').join(', ');
    targetRows = db
      .prepare(
        `SELECT id, file_uuid, original_name, relative_storage_path
         FROM files
         WHERE status = 'ACTIVE' AND file_uuid IN (${placeholders})`
      )
      .all(...fileUuids) as unknown as typeof targetRows;
  }

  if (targetRows.length === 0) {
    res.status(404).json({ error: 'ไม่พบรายการไฟล์ที่ต้องการลบ' });
    return;
  }

  for (const row of targetRows) {
    try {
      const absPath = resolveSafeStoragePath(appConfig.paths.storage, row.relative_storage_path);
      if (fs.existsSync(absPath)) {
        fs.unlinkSync(absPath);
      }
    } catch {
      // Ignore physical unlink error if already missing
    }
  }

  runInTransaction(db, () => {
    const updateStmt = db.prepare(`UPDATE files SET status = 'DELETED' WHERE id = ?`);
    const deleteNotifStmt = db.prepare(`DELETE FROM notifications WHERE file_pk = ?`);
    for (const row of targetRows) {
      updateStmt.run(row.id);
      deleteNotifStmt.run(row.id);
    }
  });

  writeSystemLog({
    level: 'INFO',
    category: 'ADMIN',
    action: deleteAll ? 'ALL_FILES_DELETED_BY_ADMIN' : 'FILES_BULK_DELETED_BY_ADMIN',
    actorUserId: admin.userId,
    ipAddress: req.ip,
    details: {
      deleteAll,
      deletedCount: targetRows.length,
      deletedUuids: targetRows.map((r) => r.file_uuid),
      deletedNames: targetRows.map((r) => r.original_name),
    },
  });

  broadcastRealtimeEvent({
    type: 'FILE_DELETED',
    itemUuid: targetRows[0]?.file_uuid || 'BULK_DELETE',
    title: `ลบไฟล์ ${targetRows.length} รายการ`,
    visibility: 'PUBLIC',
    recipientUserIds: [],
    timestamp: new Date().toISOString(),
  });

  res.json({
    ok: true,
    deletedCount: targetRows.length,
    message: `ลบไฟล์สำเร็จทั้งหมด ${targetRows.length} รายการ`,
  });
});

/**
 * PATCH /api/admin/files/:fileUuid/recipient
 * ให้ Admin สามารถกำหนดหรือเปลี่ยนผู้รับไฟล์ย้อนหลังผ่านหน้าเว็บได้ (เช่น ย้ายจาก Public ไปเป็น Private ของผู้ใช้ที่ต้องการ)
 */
adminRouter.patch('/files/:fileUuid/recipient', (req: Request, res: Response) => {
  const admin = req.authUser!;
  const fileUuid = String(req.params.fileUuid || '').trim();
  const targetUserId = String(req.body?.recipientUserId || '').trim();
  const db = getDb();

  const fileRow = db
    .prepare(
      `SELECT id, file_uuid, original_name, stored_filename, relative_storage_path,
              file_category, file_size_bytes, attached_message, visibility, received_at
       FROM files
       WHERE file_uuid = ? AND status = 'ACTIVE'`
    )
    .get(fileUuid) as
    | {
        id: number;
        file_uuid: string;
        original_name: string;
        stored_filename: string;
        relative_storage_path: string;
        file_category: string;
        file_size_bytes: number;
        attached_message: string | null;
        visibility: 'PRIVATE' | 'PUBLIC';
        received_at: string;
      }
    | undefined;

  if (!fileRow) {
    res.status(404).json({ error: 'ไม่พบไฟล์ที่ต้องการเปลี่ยนผู้รับ' });
    return;
  }

  // Case 1: Set to PUBLIC
  if (!targetUserId || targetUserId.toUpperCase() === 'PUBLIC') {
    const currentAbsPath = resolveSafeStoragePath(
      appConfig.paths.storage,
      fileRow.relative_storage_path
    );
    const newAbsPath = resolveSafeStoragePath(
      appConfig.paths.publicStorage,
      fileRow.stored_filename
    );
    if (fs.existsSync(currentAbsPath) && currentAbsPath !== newAbsPath) {
      fs.renameSync(currentAbsPath, newAbsPath);
    }
    const newRelPath = path.posix.join('public', fileRow.stored_filename);

    runInTransaction(db, () => {
      db.prepare(
        `UPDATE files SET visibility = 'PUBLIC', relative_storage_path = ? WHERE id = ?`
      ).run(newRelPath, fileRow.id);
      db.prepare(`DELETE FROM file_recipients WHERE file_pk = ?`).run(fileRow.id);
    });

    broadcastRealtimeEvent({
      type: 'FILE_UPDATED',
      itemUuid: fileRow.file_uuid,
      title: fileRow.original_name,
      fileCategory: fileRow.file_category,
      fileSizeBytes: fileRow.file_size_bytes,
      visibility: 'PUBLIC',
      recipientUserIds: [],
      attachedMessage: fileRow.attached_message,
      timestamp: new Date().toISOString(),
    });

    res.json({
      ok: true,
      visibility: 'PUBLIC',
      recipientUserIds: null,
      message: `เปลี่ยนสถานะไฟล์ "${fileRow.original_name}" เป็น Public (ส่วนกลาง) เรียบร้อยแล้ว`,
    });
    return;
  }

  // Case 2: Set to PRIVATE for a specific user
  const userRow = db
    .prepare(`SELECT id, user_id, full_name FROM users WHERE user_id = ?`)
    .get(targetUserId) as { id: number; user_id: string; full_name: string } | undefined;

  if (!userRow) {
    res.status(404).json({ error: `ไม่พบบัญชีผู้ใช้งานรหัส "${targetUserId}"` });
    return;
  }

  const currentAbsPath = resolveSafeStoragePath(
    appConfig.paths.storage,
    fileRow.relative_storage_path
  );
  const userFolder = sanitizeUserFolderId(userRow.user_id);
  const userPrivateDir = resolveSafeStoragePath(appConfig.paths.privateStorage, userFolder);
  if (!fs.existsSync(userPrivateDir)) {
    fs.mkdirSync(userPrivateDir, { recursive: true });
  }
  const newAbsPath = resolveSafeStoragePath(userPrivateDir, fileRow.stored_filename);
  if (fs.existsSync(currentAbsPath) && currentAbsPath !== newAbsPath) {
    fs.renameSync(currentAbsPath, newAbsPath);
  }
  const newRelPath = path.posix.join('private', userFolder, fileRow.stored_filename);

  runInTransaction(db, () => {
    db.prepare(
      `UPDATE files SET visibility = 'PRIVATE', relative_storage_path = ? WHERE id = ?`
    ).run(newRelPath, fileRow.id);
    db.prepare(`DELETE FROM file_recipients WHERE file_pk = ?`).run(fileRow.id);
    db.prepare(
      `INSERT INTO file_recipients (file_pk, user_pk, recipient_user_id, assigned_at)
       VALUES (?, ?, ?, datetime('now'))`
    ).run(fileRow.id, userRow.id, userRow.user_id);

    createNotificationsForIncomingItem(db, {
      itemType: 'FILE',
      filePk: fileRow.id,
      itemUuid: fileRow.file_uuid,
      title: fileRow.original_name,
      detailMessage: fileRow.attached_message,
      fileType: fileRow.file_category,
      fileSizeBytes: fileRow.file_size_bytes,
      visibility: 'PRIVATE',
      recipients: [
        {
          userPk: userRow.id,
          userId: userRow.user_id,
          fullName: userRow.full_name,
        },
      ],
      receivedAt: new Date().toISOString(),
      eventBatchHint: `ADMIN_REASSIGN_${fileRow.file_uuid}`,
    });
  });

  writeSystemLog({
    level: 'INFO',
    category: 'ADMIN',
    action: 'FILE_RECIPIENT_ASSIGNED_BY_ADMIN',
    actorUserId: admin.userId,
    ipAddress: req.ip,
    details: {
      fileUuid,
      originalName: fileRow.original_name,
      recipientUserId: userRow.user_id,
    },
  });

  broadcastRealtimeEvent({
    type: 'FILE_UPDATED',
    itemUuid: fileRow.file_uuid,
    title: fileRow.original_name,
    fileCategory: fileRow.file_category,
    fileSizeBytes: fileRow.file_size_bytes,
    visibility: 'PRIVATE',
    recipientUserIds: [userRow.user_id],
    attachedMessage: fileRow.attached_message,
    timestamp: new Date().toISOString(),
  });

  res.json({
    ok: true,
    visibility: 'PRIVATE',
    recipientUserIds: userRow.user_id,
    message: `กำหนดผู้รับไฟล์ "${fileRow.original_name}" เป็น Private (${userRow.user_id} - ${userRow.full_name}) เรียบร้อยแล้ว`,
  });
});

/**
 * PATCH /api/admin/files/:fileUuid/comment
 * ให้ Admin สามารถแก้ไขข้อความที่ฝากถึงผู้รับ (Comment) ของไฟล์ได้ผ่านหน้าเว็บ
 */
adminRouter.patch('/files/:fileUuid/comment', (req: Request, res: Response) => {
  const admin = req.authUser!;
  const fileUuid = String(req.params.fileUuid || '').trim();
  const rawComment = req.body?.comment;
  const newComment =
    typeof rawComment === 'string' && rawComment.trim().length > 0 ? rawComment.trim() : null;
  const db = getDb();

  const fileRow = db
    .prepare(`SELECT id, original_name FROM files WHERE file_uuid = ? AND status = 'ACTIVE'`)
    .get(fileUuid) as { id: number; original_name: string } | undefined;

  if (!fileRow) {
    res.status(404).json({ error: 'ไม่พบไฟล์ที่ต้องการแก้ไขข้อความฝาก' });
    return;
  }

  runInTransaction(db, () => {
    db.prepare(`UPDATE files SET attached_message = ? WHERE id = ?`).run(newComment, fileRow.id);
    db.prepare(`UPDATE notifications SET detail_message = ? WHERE file_pk = ?`).run(
      newComment,
      fileRow.id
    );
  });

  writeSystemLog({
    level: 'INFO',
    category: 'ADMIN',
    action: 'FILE_COMMENT_UPDATED_BY_ADMIN',
    actorUserId: admin.userId,
    ipAddress: req.ip,
    details: {
      fileUuid,
      originalName: fileRow.original_name,
      comment: newComment,
    },
  });

  broadcastRealtimeEvent({
    type: 'FILE_UPDATED',
    itemUuid: fileUuid,
    title: fileRow.original_name,
    visibility: 'PUBLIC',
    recipientUserIds: [],
    attachedMessage: newComment,
    timestamp: new Date().toISOString(),
  });

  res.json({
    ok: true,
    attachedMessage: newComment,
    message: `บันทึกข้อความที่ฝาก (Comment) ของไฟล์ "${fileRow.original_name}" เรียบร้อยแล้ว`,
  });
});

/**
 * GET /api/admin/system-status
 * Section 10.5: ดูสถานะระบบที่จำเป็น
 */
adminRouter.get('/system-status', (_req: Request, res: Response) => {
  const db = getDb();
  const disk = getDiskSpaceInfo(appConfig.storageRootPath);

  const userCount = (
    db.prepare(`SELECT COUNT(*) AS cnt FROM users WHERE role = 'USER'`).get() as { cnt: number }
  ).cnt;
  const activeUserCount = (
    db
      .prepare(`SELECT COUNT(*) AS cnt FROM users WHERE role = 'USER' AND status = 'ACTIVE'`)
      .get() as { cnt: number }
  ).cnt;
  const privateFileCount = (
    db
      .prepare(`SELECT COUNT(*) AS cnt FROM files WHERE status = 'ACTIVE' AND visibility = 'PRIVATE'`)
      .get() as { cnt: number }
  ).cnt;
  const publicFileCount = (
    db
      .prepare(`SELECT COUNT(*) AS cnt FROM files WHERE status = 'ACTIVE' AND visibility = 'PUBLIC'`)
      .get() as { cnt: number }
  ).cnt;
  const totalStorageBytes = (
    db
      .prepare(`SELECT COALESCE(SUM(file_size_bytes), 0) AS total FROM files WHERE status = 'ACTIVE'`)
      .get() as { total: number }
  ).total;
  const urlCount = (
    db.prepare(`SELECT COUNT(*) AS cnt FROM url_records WHERE status = 'ACTIVE'`).get() as {
      cnt: number;
    }
  ).cnt;

  const latestBackup = db
    .prepare(
      `SELECT backup_id AS backupId, backup_type AS backupType, status,
              db_size_bytes AS dbSizeBytes, total_files_count AS totalFilesCount,
              total_files_bytes AS totalFilesBytes, started_at AS startedAt,
              completed_at AS completedAt, error_message AS errorMessage
       FROM backup_logs
       ORDER BY id DESC LIMIT 1`
    )
    .get();

  let dbFileSizeBytes = 0;
  try {
    dbFileSizeBytes = fs.statSync(appConfig.paths.databaseFile).size;
  } catch {
    dbFileSizeBytes = 0;
  }

  res.json({
    serverTime: new Date().toISOString(),
    platform: process.platform,
    storageRootPath: appConfig.storageRootPath,
    backupRootPath: appConfig.backupRootPath,
    disk: {
      freeBytes: disk.freeBytes,
      usedBytes: disk.usedBytes,
      totalBytes: disk.totalBytes,
      minFreeRequiredBytes: appConfig.limits.minFreeDiskBytes,
    },
    database: {
      filePath: appConfig.paths.databaseFile,
      sizeBytes: dbFileSizeBytes,
    },
    counts: {
      userCount,
      activeUserCount,
      privateFileCount,
      publicFileCount,
      totalFileCount: privateFileCount + publicFileCount,
      totalStorageBytes,
      urlCount,
    },
    lineConfig: {
      hasChannelSecret: Boolean(appConfig.line.channelSecret),
      hasChannelAccessToken: Boolean(appConfig.line.channelAccessToken),
      allowedSenderLineUserId: appConfig.line.allowedSenderLineUserId || 'ยังไม่จำกัด (รับจากแชท 1-on-1)',
      recipientSyntaxMode: 'Public Default (รอการกำหนด Syntax จากอาจารย์ตาม REQ-03)',
    },
    backupSchedule: appConfig.backup.cronSchedule,
    latestBackup: latestBackup || null,
  });
});

/**
 * GET /api/admin/logs
 * Section 10.5: ดู Log ที่เกี่ยวข้องกับการรับไฟล์ (LINE Webhook) และ Backup และ System Logs
 */
adminRouter.get('/logs', (_req: Request, res: Response) => {
  const db = getDb();

  const webhookLogs = db
    .prepare(
      `SELECT
        id,
        webhook_event_id AS webhookEventId,
        line_message_id AS lineMessageId,
        sender_line_user_id AS senderLineUserId,
        event_type AS eventType,
        message_type AS messageType,
        processing_status AS processingStatus,
        is_redelivery AS isRedelivery,
        reply_status AS replyStatus,
        error_message AS errorMessage,
        received_at AS receivedAt,
        completed_at AS completedAt
       FROM line_webhook_events
       ORDER BY id DESC
       LIMIT 100`
    )
    .all();

  const backupLogs = db
    .prepare(
      `SELECT
        id,
        backup_id AS backupId,
        backup_type AS backupType,
        target_path AS targetPath,
        status,
        db_size_bytes AS dbSizeBytes,
        total_files_count AS totalFilesCount,
        total_files_bytes AS totalFilesBytes,
        manifest_sha256 AS manifestSha256,
        error_message AS errorMessage,
        started_at AS startedAt,
        completed_at AS completedAt
       FROM backup_logs
       ORDER BY id DESC
       LIMIT 50`
    )
    .all();

  const systemLogs = db
    .prepare(
      `SELECT
        id,
        level,
        category,
        action,
        actor_user_id AS actorUserId,
        ip_address AS ipAddress,
        details_json AS detailsJson,
        created_at AS createdAt
       FROM system_logs
       ORDER BY id DESC
       LIMIT 100`
    )
    .all();

  res.json({
    webhookLogs,
    backupLogs,
    systemLogs,
  });
});

/**
 * POST /api/admin/backups/run
 * สั่งสำรองข้อมูลทันที (นอกเหนือจากรอบอัตโนมัติทุก 6 ชั่วโมง)
 */
adminRouter.post('/backups/run', async (req: Request, res: Response) => {
  const admin = req.authUser!;
  writeSystemLog({
    level: 'INFO',
    category: 'ADMIN',
    action: 'MANUAL_BACKUP_TRIGGERED',
    actorUserId: admin.userId,
    ipAddress: req.ip,
  });

  const result = await performSystemBackup('MANUAL');
  if (result.status === 'FAILED') {
    res.status(500).json({ error: result.errorMessage || 'การทำ Backup ล้มเหลว', result });
    return;
  }
  res.json({ ok: true, result });
});

/**
 * POST /api/admin/backups/:backupId/restore
 * REQ-12: กู้คืนข้อมูลจากชุด Backup ที่เลือก
 */
adminRouter.post('/backups/:backupId/restore', async (req: Request, res: Response) => {
  try {
    const admin = req.authUser!;
    const backupId = String(req.params.backupId || '').trim();
    const restoreResult = await restoreSystemFromBackup(backupId);

    writeSystemLog({
      level: 'INFO',
      category: 'ADMIN',
      action: 'BACKUP_RESTORED_BY_ADMIN',
      actorUserId: admin.userId,
      ipAddress: req.ip,
      details: restoreResult,
    });

    res.json({ ok: true, restoreResult });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
});

