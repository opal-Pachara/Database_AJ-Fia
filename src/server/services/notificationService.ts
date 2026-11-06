import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { appConfig } from '../config.js';
import { ValidatedRecipient } from './recipientParser.js';

export interface CreateNotificationPayload {
  itemType: 'FILE' | 'URL';
  filePk?: number | null;
  urlPk?: number | null;
  itemUuid: string;
  title: string;
  detailMessage?: string | null;
  fileType?: string | null;
  fileSizeBytes?: number | null;
  visibility: 'PRIVATE' | 'PUBLIC';
  recipients: ValidatedRecipient[];
  receivedAt: string;
  eventBatchHint?: string | null;
}

/**
 * Creates Inbox notifications for target users and automatically groups notifications
 * from the same event / time window into a single Notification Group.
 *
 * REQ-17: ระบบแจ้งเตือนภายในเว็บไซต์ (Inbox)
 * REQ-18: การรวม Notification เป็นกลุ่มตามช่วงเวลาที่ได้รับไฟล์ โดยไม่รวมไฟล์จากคนละเหตุการณ์เข้าด้วยกันโดยผิดพลาด
 */
export function createNotificationsForIncomingItem(
  db: DatabaseSync,
  payload: CreateNotificationPayload
): void {
  // Determine which users should receive this notification:
  // - PRIVATE: only the explicitly matched active recipients
  // - PUBLIC: all ACTIVE users (role = 'USER')
  let targetUserPks: number[] = [];

  if (payload.visibility === 'PRIVATE') {
    targetUserPks = payload.recipients.map((r) => r.userPk);
  } else {
    const activeUsers = db
      .prepare(`SELECT id FROM users WHERE status = 'ACTIVE' AND role = 'USER'`)
      .all() as Array<{ id: number }>;
    targetUserPks = activeUsers.map((u) => u.id);
  }

  if (targetUserPks.length === 0) {
    return;
  }

  const receivedTimeMs = new Date(payload.receivedAt).getTime();
  const windowMs = appConfig.notifications.groupWindowSeconds * 1000;
  const windowStartIso = new Date(receivedTimeMs - windowMs).toISOString();

  // Construct a deterministic batch key per visibility + explicit batch hint (such as imageSet.id or quotedMessageId)
  // If no explicit hint exists, use 'TIME_WINDOW_<visibility>' and rely on the strict time window check on unread groups.
  const batchKey = payload.eventBatchHint
    ? `${payload.visibility}:BATCH:${payload.eventBatchHint}`
    : `${payload.visibility}:WINDOW`;

  const findExistingGroupStmt = db.prepare(`
    SELECT id, item_count, first_received_at
    FROM notification_groups
    WHERE user_pk = ?
      AND visibility_scope = ?
      AND batch_key = ?
      AND is_read = 0
      AND last_received_at >= ?
    ORDER BY last_received_at DESC
    LIMIT 1
  `);

  const insertGroupStmt = db.prepare(`
    INSERT INTO notification_groups (
      group_uuid, user_pk, visibility_scope, batch_key, title_summary,
      item_count, is_read, first_received_at, last_received_at, created_at
    ) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?, datetime('now'))
  `);

  const updateGroupStmt = db.prepare(`
    UPDATE notification_groups
    SET item_count = ?,
        title_summary = ?,
        last_received_at = ?
    WHERE id = ?
  `);

  const insertNotificationStmt = db.prepare(`
    INSERT INTO notifications (
      notification_uuid, group_pk, user_pk, item_type, file_pk, url_pk,
      item_uuid, title, detail_message, file_type, file_size_bytes,
      visibility, is_read, received_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, datetime('now'))
  `);

  for (const userPk of targetUserPks) {
    const existingGroup = findExistingGroupStmt.get(
      userPk,
      payload.visibility,
      batchKey,
      windowStartIso
    ) as { id: number; item_count: number; first_received_at: string } | undefined;

    let groupPk: number;
    if (existingGroup) {
      groupPk = existingGroup.id;
      const newCount = existingGroup.item_count + 1;
      const scopeLabel = payload.visibility === 'PRIVATE' ? 'ส่วนตัว' : 'ส่วนกลาง (Public)';
      const summary = `ได้รับไฟล์/ลิงก์${scopeLabel}ใหม่ ${newCount} รายการ`;
      updateGroupStmt.run(newCount, summary, payload.receivedAt, groupPk);
    } else {
      const groupUuid = crypto.randomUUID();
      const scopeLabel = payload.visibility === 'PRIVATE' ? 'ส่วนตัว' : 'ส่วนกลาง (Public)';
      const summary =
        payload.itemType === 'URL'
          ? `ได้รับลิงก์${scopeLabel}ใหม่: ${payload.title}`
          : `ได้รับไฟล์${scopeLabel}ใหม่: ${payload.title}`;
      const res = insertGroupStmt.run(
        groupUuid,
        userPk,
        payload.visibility,
        batchKey,
        summary,
        payload.receivedAt,
        payload.receivedAt
      );
      groupPk = Number(res.lastInsertRowid);
    }

    insertNotificationStmt.run(
      crypto.randomUUID(),
      groupPk,
      userPk,
      payload.itemType,
      payload.filePk ?? null,
      payload.urlPk ?? null,
      payload.itemUuid,
      payload.title,
      payload.detailMessage ?? null,
      payload.fileType ?? null,
      payload.fileSizeBytes ?? null,
      payload.visibility,
      payload.receivedAt
    );
  }
}

