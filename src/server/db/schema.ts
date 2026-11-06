import { DatabaseSync } from 'node:sqlite';

export function initializeSchema(db: DatabaseSync): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    -- 1. ตารางผู้ใช้งานและผู้ดูแลระบบ (Users & Admin Accounts - REQ-05, REQ-06)
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN')),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
      must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0, 1)),
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, status);

    -- 2. ตารางจัดการ Session อย่างปลอดภัย (Secure Sessions - REQ-06, Section 8)
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      user_pk INTEGER NOT NULL,
      csrf_token TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_pk) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_pk ON sessions(user_pk);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

    -- 3. ตารางบันทึก LINE Webhook Events และสถานะการประมวลผล (Section 6 & 7)
    CREATE TABLE IF NOT EXISTS line_webhook_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      webhook_event_id TEXT NOT NULL UNIQUE,
      line_message_id TEXT UNIQUE,
      quote_token TEXT,
      quoted_message_id TEXT,
      image_set_id TEXT,
      sender_line_user_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      event_type TEXT NOT NULL,
      message_type TEXT,
      raw_payload TEXT NOT NULL,
      processing_status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (
        processing_status IN (
          'RECEIVED',
          'VALIDATING',
          'DOWNLOADING',
          'STORING',
          'DATABASE_COMMITTED',
          'SUCCESS',
          'FAILED'
        )
      ),
      is_redelivery INTEGER NOT NULL DEFAULT 0 CHECK (is_redelivery IN (0, 1)),
      reply_status TEXT NOT NULL DEFAULT 'NOT_APPLICABLE' CHECK (
        reply_status IN ('PENDING', 'SENT', 'EXPIRED', 'FAILED', 'NOT_APPLICABLE')
      ),
      error_message TEXT,
      received_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON line_webhook_events(processing_status, received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_webhook_events_msg_id ON line_webhook_events(line_message_id);

    -- 4. ตารางข้อมูลไฟล์และ Metadata (Files, Public Files, File Metadata - REQ-04, REQ-07, REQ-10, REQ-13, REQ-15)
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_uuid TEXT NOT NULL UNIQUE,
      webhook_event_pk INTEGER,
      line_message_id TEXT UNIQUE,
      original_name TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      relative_storage_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_extension TEXT NOT NULL,
      file_category TEXT NOT NULL CHECK (
        file_category IN ('PDF', 'IMAGE', 'DOCUMENT', 'VIDEO', 'AUDIO', 'ARCHIVE', 'OTHER')
      ),
      file_size_bytes INTEGER NOT NULL CHECK (file_size_bytes >= 0),
      sha256_checksum TEXT NOT NULL,
      attached_message TEXT,
      recipient_raw_text TEXT,
      visibility TEXT NOT NULL DEFAULT 'PUBLIC' CHECK (visibility IN ('PRIVATE', 'PUBLIC')),
      is_previewable INTEGER NOT NULL DEFAULT 0 CHECK (is_previewable IN (0, 1)),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DELETED')),
      received_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (webhook_event_pk) REFERENCES line_webhook_events(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_files_status_vis_rec ON files(status, visibility, received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_files_category ON files(status, file_category, received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_files_search_name ON files(original_name);

    -- 5. ตารางสิทธิ์ผู้รับไฟล์ส่วนตัว (File Recipients - REQ-03, REQ-05)
    -- ON DELETE SET NULL บน user_pk เพื่อให้เมื่อ Admin ลบบัญชี User แล้วไฟล์ยังคงอยู่ไม่ถูกลบตาม (REQ-05)
    CREATE TABLE IF NOT EXISTS file_recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_pk INTEGER NOT NULL,
      user_pk INTEGER,
      recipient_user_id TEXT NOT NULL,
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(file_pk, recipient_user_id),
      FOREIGN KEY (file_pk) REFERENCES files(id) ON DELETE CASCADE,
      FOREIGN KEY (user_pk) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_file_recipients_user_id ON file_recipients(recipient_user_id);
    CREATE INDEX IF NOT EXISTS idx_file_recipients_user_pk ON file_recipients(user_pk);

    -- 6. ตารางบันทึกข้อมูล URL / Link (URL Records - REQ-13, REQ-14)
    CREATE TABLE IF NOT EXISTS url_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_uuid TEXT NOT NULL UNIQUE,
      webhook_event_pk INTEGER,
      line_message_id TEXT,
      url TEXT NOT NULL,
      attached_message TEXT,
      visibility TEXT NOT NULL DEFAULT 'PUBLIC' CHECK (visibility IN ('PRIVATE', 'PUBLIC')),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DELETED')),
      received_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (webhook_event_pk) REFERENCES line_webhook_events(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_url_records_status_vis ON url_records(status, visibility, received_at DESC);

    -- 7. ตารางสิทธิ์ผู้รับ URL ส่วนตัว (URL Recipients)
    CREATE TABLE IF NOT EXISTS url_recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_pk INTEGER NOT NULL,
      user_pk INTEGER,
      recipient_user_id TEXT NOT NULL,
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(url_pk, recipient_user_id),
      FOREIGN KEY (url_pk) REFERENCES url_records(id) ON DELETE CASCADE,
      FOREIGN KEY (user_pk) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_url_recipients_user_id ON url_recipients(recipient_user_id);

    -- 8. ตารางกลุ่มการแจ้งเตือน (Notification Groups - REQ-18)
    CREATE TABLE IF NOT EXISTS notification_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_uuid TEXT NOT NULL UNIQUE,
      user_pk INTEGER NOT NULL,
      visibility_scope TEXT NOT NULL CHECK (visibility_scope IN ('PRIVATE', 'PUBLIC')),
      batch_key TEXT NOT NULL,
      title_summary TEXT NOT NULL,
      item_count INTEGER NOT NULL DEFAULT 1,
      is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
      first_received_at TEXT NOT NULL,
      last_received_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_pk) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_notif_groups_user ON notification_groups(user_pk, is_read, last_received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notif_groups_batch ON notification_groups(user_pk, batch_key, last_received_at DESC);

    -- 9. ตารางรายการแจ้งเตือนย่อยภายในกลุ่ม (Notifications - REQ-17, REQ-18)
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notification_uuid TEXT NOT NULL UNIQUE,
      group_pk INTEGER NOT NULL,
      user_pk INTEGER NOT NULL,
      item_type TEXT NOT NULL CHECK (item_type IN ('FILE', 'URL')),
      file_pk INTEGER,
      url_pk INTEGER,
      item_uuid TEXT NOT NULL,
      title TEXT NOT NULL,
      detail_message TEXT,
      file_type TEXT,
      file_size_bytes INTEGER,
      visibility TEXT NOT NULL CHECK (visibility IN ('PRIVATE', 'PUBLIC')),
      is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
      received_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (group_pk) REFERENCES notification_groups(id) ON DELETE CASCADE,
      FOREIGN KEY (user_pk) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (file_pk) REFERENCES files(id) ON DELETE CASCADE,
      FOREIGN KEY (url_pk) REFERENCES url_records(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_pk, is_read, received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notifications_group ON notifications(group_pk);

    -- 10. ตารางบันทึกประวัติการ Backup (Backup Logs - REQ-12)
    CREATE TABLE IF NOT EXISTS backup_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      backup_id TEXT NOT NULL UNIQUE,
      backup_type TEXT NOT NULL CHECK (backup_type IN ('SCHEDULED_6H', 'MANUAL')),
      target_path TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILED', 'RESTORED')),
      db_size_bytes INTEGER NOT NULL DEFAULT 0,
      total_files_count INTEGER NOT NULL DEFAULT 0,
      total_files_bytes INTEGER NOT NULL DEFAULT 0,
      manifest_sha256 TEXT,
      error_message TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_backup_logs_started ON backup_logs(started_at DESC);

    -- 11. ตารางบันทึกการทำงานของระบบและความปลอดภัย (System Logs - Section 6, 8, 11)
    CREATE TABLE IF NOT EXISTS system_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL CHECK (level IN ('INFO', 'WARN', 'ERROR', 'SECURITY')),
      category TEXT NOT NULL CHECK (category IN ('WEBHOOK', 'AUTH', 'FILE', 'BACKUP', 'ADMIN', 'SYSTEM')),
      action TEXT NOT NULL,
      actor_user_id TEXT,
      ip_address TEXT,
      details_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_system_logs_created ON system_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_system_logs_category ON system_logs(category, level, created_at DESC);
  `);
}

