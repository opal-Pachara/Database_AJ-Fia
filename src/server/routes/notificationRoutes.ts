import crypto from 'node:crypto';
import { Router, Request, Response } from 'express';
import { getDb, runInTransaction } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { registerRealtimeClient } from '../services/realtimeEvents.js';

export const notificationRouter = Router();

/**
 * GET /api/notifications/stream
 * Server-Sent Events (SSE) สำหรับอัปเดตหน้าเว็บและส่งการแจ้งเตือนแบบ Real-Time ทันทีที่มีไฟล์หรือลิงก์เข้ามา
 */
notificationRouter.get('/stream', requireAuth(), (req: Request, res: Response) => {
  const user = req.authUser!;

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  res.write(`: connected ${new Date().toISOString()}\n\n`);

  const clientId = crypto.randomUUID();
  const cleanup = registerRealtimeClient({
    clientId,
    userPk: user.id,
    userId: user.userId,
    role: user.role,
    res,
  });

  req.on('close', () => {
    cleanup();
  });
});

/**
 * GET /api/notifications
 * REQ-17, REQ-18: ดึงข้อมูล Notification Inbox พร้อมการรวมกลุ่ม (Notification Groups) และจำนวนที่ยังไม่ได้อ่าน
 */
notificationRouter.get('/', requireAuth(), (req: Request, res: Response) => {
  const user = req.authUser!;
  const db = getDb();

  const groups = db
    .prepare(
      `SELECT
        id,
        group_uuid AS groupUuid,
        visibility_scope AS visibilityScope,
        title_summary AS titleSummary,
        item_count AS itemCount,
        is_read AS isRead,
        first_received_at AS firstReceivedAt,
        last_received_at AS lastReceivedAt
       FROM notification_groups
       WHERE user_pk = ?
       ORDER BY last_received_at DESC, id DESC`
    )
    .all(user.id) as Array<{
    id: number;
    groupUuid: string;
    visibilityScope: 'PRIVATE' | 'PUBLIC';
    titleSummary: string;
    itemCount: number;
    isRead: number;
    firstReceivedAt: string;
    lastReceivedAt: string;
  }>;

  const items = db
    .prepare(
      `SELECT
        id,
        notification_uuid AS notificationUuid,
        group_pk AS groupPk,
        item_type AS itemType,
        item_uuid AS itemUuid,
        title,
        detail_message AS detailMessage,
        file_type AS fileType,
        file_size_bytes AS fileSizeBytes,
        visibility,
        is_read AS isRead,
        received_at AS receivedAt
       FROM notifications
       WHERE user_pk = ?
       ORDER BY received_at DESC, id DESC`
    )
    .all(user.id) as Array<{
    id: number;
    notificationUuid: string;
    groupPk: number;
    itemType: 'FILE' | 'URL';
    itemUuid: string;
    title: string;
    detailMessage: string | null;
    fileType: string | null;
    fileSizeBytes: number | null;
    visibility: 'PRIVATE' | 'PUBLIC';
    isRead: number;
    receivedAt: string;
  }>;

  const itemsByGroup = new Map<number, typeof items>();
  let unreadItemCount = 0;

  for (const item of items) {
    if (item.isRead === 0) {
      unreadItemCount += 1;
    }
    const list = itemsByGroup.get(item.groupPk) || [];
    list.push(item);
    itemsByGroup.set(item.groupPk, list);
  }

  let unreadGroupCount = 0;
  const formattedGroups = groups
    .map((g) => {
      const groupItems = (itemsByGroup.get(g.id) || []).map((it) => ({
        notificationUuid: it.notificationUuid,
        itemType: it.itemType,
        itemUuid: it.itemUuid,
        title: it.title,
        detailMessage: it.detailMessage,
        fileType: it.fileType,
        fileSizeBytes: it.fileSizeBytes,
        visibility: it.visibility,
        isRead: it.isRead === 1,
        receivedAt: it.receivedAt,
      }));

      const groupUnread = groupItems.some((it) => !it.isRead);
      if (groupUnread) {
        unreadGroupCount += 1;
      }

      return {
        groupUuid: g.groupUuid,
        visibilityScope: g.visibilityScope,
        titleSummary: g.titleSummary,
        itemCount: groupItems.length,
        isRead: !groupUnread,
        firstReceivedAt: g.firstReceivedAt,
        lastReceivedAt: g.lastReceivedAt,
        items: groupItems,
      };
    })
    .filter((g) => g.itemCount > 0);

  res.json({
    unreadGroupCount,
    unreadItemCount,
    groups: formattedGroups,
  });
});

/**
 * PATCH /api/notifications/groups/:groupUuid/read
 * REQ-17: เปลี่ยนสถานะ Read / Unread ของกลุ่ม Notification
 */
notificationRouter.patch(
  '/groups/:groupUuid/read',
  requireAuth(),
  (req: Request, res: Response) => {
    const user = req.authUser!;
    const groupUuid = String(req.params.groupUuid || '').trim();
    const isRead = req.body?.isRead ? 1 : 0;

    const db = getDb();
    const group = db
      .prepare('SELECT id FROM notification_groups WHERE group_uuid = ? AND user_pk = ?')
      .get(groupUuid, user.id) as { id: number } | undefined;

    if (!group) {
      res.status(404).json({ error: 'ไม่พบกลุ่มการแจ้งเตือนนี้' });
      return;
    }

    runInTransaction(db, () => {
      db.prepare('UPDATE notification_groups SET is_read = ? WHERE id = ?').run(isRead, group.id);
      db.prepare('UPDATE notifications SET is_read = ? WHERE group_pk = ? AND user_pk = ?').run(
        isRead,
        group.id,
        user.id
      );
    });

    res.json({ ok: true, isRead: isRead === 1 });
  }
);

/**
 * PATCH /api/notifications/items/:notificationUuid/read
 * REQ-17: เปลี่ยนสถานะ Read / Unread ของรายการ Notification ย่อย
 */
notificationRouter.patch(
  '/items/:notificationUuid/read',
  requireAuth(),
  (req: Request, res: Response) => {
    const user = req.authUser!;
    const notificationUuid = String(req.params.notificationUuid || '').trim();
    const isRead = req.body?.isRead ? 1 : 0;

    const db = getDb();
    const item = db
      .prepare(
        'SELECT id, group_pk FROM notifications WHERE notification_uuid = ? AND user_pk = ?'
      )
      .get(notificationUuid, user.id) as { id: number; group_pk: number } | undefined;

    if (!item) {
      res.status(404).json({ error: 'ไม่พบรายการแจ้งเตือนนี้' });
      return;
    }

    runInTransaction(db, () => {
      db.prepare('UPDATE notifications SET is_read = ? WHERE id = ?').run(isRead, item.id);

      // Sync group read status: group is read iff all items in group are read
      const remainingUnread = db
        .prepare(
          'SELECT COUNT(*) AS cnt FROM notifications WHERE group_pk = ? AND user_pk = ? AND is_read = 0'
        )
        .get(item.group_pk, user.id) as { cnt: number };

      const groupRead = remainingUnread.cnt === 0 ? 1 : 0;
      db.prepare('UPDATE notification_groups SET is_read = ? WHERE id = ?').run(
        groupRead,
        item.group_pk
      );
    });

    res.json({ ok: true, isRead: isRead === 1 });
  }
);

/**
 * POST /api/notifications/read-all
 */
notificationRouter.post('/read-all', requireAuth(), (req: Request, res: Response) => {
  const user = req.authUser!;
  const db = getDb();

  runInTransaction(db, () => {
    db.prepare('UPDATE notification_groups SET is_read = 1 WHERE user_pk = ?').run(user.id);
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_pk = ?').run(user.id);
  });

  res.json({ ok: true });
});

/**
 * DELETE /api/notifications/groups/:groupUuid
 * REQ-17: ลบ Notification ของตนเองได้ (ลบทั้งกลุ่ม)
 */
notificationRouter.delete(
  '/groups/:groupUuid',
  requireAuth(),
  (req: Request, res: Response) => {
    const user = req.authUser!;
    const groupUuid = String(req.params.groupUuid || '').trim();
    const db = getDb();

    const group = db
      .prepare('SELECT id FROM notification_groups WHERE group_uuid = ? AND user_pk = ?')
      .get(groupUuid, user.id) as { id: number } | undefined;

    if (!group) {
      res.status(404).json({ error: 'ไม่พบกลุ่มการแจ้งเตือนนี้' });
      return;
    }

    runInTransaction(db, () => {
      db.prepare('DELETE FROM notifications WHERE group_pk = ? AND user_pk = ?').run(
        group.id,
        user.id
      );
      db.prepare('DELETE FROM notification_groups WHERE id = ? AND user_pk = ?').run(
        group.id,
        user.id
      );
    });

    res.json({ ok: true });
  }
);

/**
 * DELETE /api/notifications/items/:notificationUuid
 * REQ-17: ลบ Notification รายการย่อยของตนเองได้
 */
notificationRouter.delete(
  '/items/:notificationUuid',
  requireAuth(),
  (req: Request, res: Response) => {
    const user = req.authUser!;
    const notificationUuid = String(req.params.notificationUuid || '').trim();
    const db = getDb();

    const item = db
      .prepare(
        'SELECT id, group_pk FROM notifications WHERE notification_uuid = ? AND user_pk = ?'
      )
      .get(notificationUuid, user.id) as { id: number; group_pk: number } | undefined;

    if (!item) {
      res.status(404).json({ error: 'ไม่พบรายการแจ้งเตือนนี้' });
      return;
    }

    runInTransaction(db, () => {
      db.prepare('DELETE FROM notifications WHERE id = ?').run(item.id);

      const remaining = db
        .prepare(
          'SELECT COUNT(*) AS cnt FROM notifications WHERE group_pk = ? AND user_pk = ?'
        )
        .get(item.group_pk, user.id) as { cnt: number };

      if (remaining.cnt === 0) {
        db.prepare('DELETE FROM notification_groups WHERE id = ?').run(item.group_pk);
      } else {
        db.prepare('UPDATE notification_groups SET item_count = ? WHERE id = ?').run(
          remaining.cnt,
          item.group_pk
        );
      }
    });

    res.json({ ok: true });
  }
);

