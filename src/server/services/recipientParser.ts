import { DatabaseSync } from 'node:sqlite';

export interface ValidatedRecipient {
  userPk: number;
  userId: string;
  fullName: string;
}

export interface RecipientResolutionResult {
  visibility: 'PRIVATE' | 'PUBLIC';
  recipients: ValidatedRecipient[];
  attachedMessage: string | null;
  rawText: string | null;
  statusNote: string;
}

/**
 * Custom syntax parser callback signature.
 * Once the teacher confirms the exact message syntax (REQ-03), a parser function
 * returning extracted candidate User IDs and optional cleaned message text can be registered here.
 */
export type RecipientSyntaxExtractor = (rawMessage: string) => {
  candidateUserIds: string[];
  cleanedMessage: string | null;
} | null;

let activeSyntaxExtractor: RecipientSyntaxExtractor | null = null;

/**
 * Registers or clears a confirmed recipient syntax extractor (REQ-03).
 * By default in production (`null`), no syntax is assumed or invented ("ห้ามกำหนด Syntax ขึ้นมาเอง"),
 * and all incoming files/URLs without a confirmed syntax match are safely stored in PUBLIC.
 */
export function setRecipientSyntaxExtractor(extractor: RecipientSyntaxExtractor | null): void {
  activeSyntaxExtractor = extractor;
}

export function getRecipientSyntaxExtractor(): RecipientSyntaxExtractor | null {
  return activeSyntaxExtractor;
}

/**
 * Resolves the target recipient(s) of a file or URL from its accompanying message text.
 *
 * Strict compliance with REQ-03:
 * - ใช้ข้อความ (Message/Caption) ที่ส่งมากับไฟล์เป็นข้อมูลสำหรับระบุผู้รับ
 * - รูปแบบ Syntax สำหรับระบุผู้รับยังไม่ถูกกำหนด เนื่องจากต้องรอข้อมูลจากอาจารย์ (ห้ามกำหนด Syntax ขึ้นมาเอง)
 * - หากไม่มีข้อความ หรือไม่สามารถ Parse ข้อความเพื่อระบุผู้รับได้ ให้จัดเก็บไฟล์ในพื้นที่ Public / ไม่ระบุบุคคล
 * - ห้ามทิ้งไฟล์เพียงเพราะไม่สามารถระบุผู้รับได้
 * - รองรับทั้งแบบ 1 User และหลาย Users เมื่ออาจารย์ยืนยัน Syntax แล้ว
 */
export function resolveRecipientsFromMessage(
  db: DatabaseSync,
  rawMessage?: string | null
): RecipientResolutionResult {
  const trimmed = (rawMessage || '').trim();

  if (!trimmed) {
    return {
      visibility: 'PUBLIC',
      recipients: [],
      attachedMessage: null,
      rawText: null,
      statusNote: 'Public (ไม่มีข้อความระบุผู้รับ)',
    };
  }

  // If no syntax rule has been confirmed by the teacher yet, store safely in PUBLIC while keeping the message.
  if (!activeSyntaxExtractor) {
    return {
      visibility: 'PUBLIC',
      recipients: [],
      attachedMessage: trimmed,
      rawText: trimmed,
      statusNote: 'Public (ยังไม่กำหนด Syntax ผู้รับ)',
    };
  }

  const parsed = activeSyntaxExtractor(trimmed);
  if (!parsed || !parsed.candidateUserIds || parsed.candidateUserIds.length === 0) {
    return {
      visibility: 'PUBLIC',
      recipients: [],
      attachedMessage: trimmed,
      rawText: trimmed,
      statusNote: 'Public (ข้อความไม่ตรงรูปแบบระบุผู้รับ)',
    };
  }

  // Verify candidate User IDs against active users in the database
  const uniqueCandidateIds = Array.from(new Set(parsed.candidateUserIds.map((u) => u.trim()).filter(Boolean)));
  const matchedRecipients: ValidatedRecipient[] = [];

  const stmt = db.prepare(
    `SELECT id, user_id, full_name FROM users WHERE user_id = ? AND status = 'ACTIVE' AND role = 'USER'`
  );

  for (const candidateId of uniqueCandidateIds) {
    const row = stmt.get(candidateId) as { id: number; user_id: string; full_name: string } | undefined;
    if (row) {
      matchedRecipients.push({
        userPk: row.id,
        userId: row.user_id,
        fullName: row.full_name,
      });
    }
  }

  // If none of the extracted User IDs match an active user account, fallback safely to PUBLIC (never drop the file!)
  if (matchedRecipients.length === 0) {
    return {
      visibility: 'PUBLIC',
      recipients: [],
      attachedMessage: trimmed,
      rawText: trimmed,
      statusNote: `Public (ไม่พบบัญชีผู้รับที่เปิดใช้งาน: ${uniqueCandidateIds.join(', ')})`,
    };
  }

  return {
    visibility: 'PRIVATE',
    recipients: matchedRecipients,
    attachedMessage: parsed.cleanedMessage ?? trimmed,
    rawText: trimmed,
    statusNote: `Private (${matchedRecipients.map((r) => `${r.userId} ${r.fullName}`).join(', ')})`,
  };
}

