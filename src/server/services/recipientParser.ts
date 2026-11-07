import { DatabaseSync } from 'node:sqlite';

export interface ValidatedRecipient {
  userPk: number;
  userId: string;
  fullName: string;
  matchedAlias?: string;
}

export interface RecipientResolutionResult {
  visibility: 'PRIVATE' | 'PUBLIC';
  recipients: ValidatedRecipient[];
  attachedMessage: string | null;
  rawText: string | null;
  statusNote: string;
}

export type RecipientSyntaxExtractor = (rawMessage: string) => {
  candidateUserIds: string[];
  cleanedMessage: string | null;
} | null;

let activeSyntaxExtractor: RecipientSyntaxExtractor | null = null;

export function setRecipientSyntaxExtractor(extractor: RecipientSyntaxExtractor | null): void {
  activeSyntaxExtractor = extractor;
}

export function getRecipientSyntaxExtractor(): RecipientSyntaxExtractor | null {
  return activeSyntaxExtractor;
}

interface ActiveUserRecord {
  id: number;
  user_id: string;
  full_name: string;
  line_aliases: string;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Splits a message by the first `/` separator (ignoring `http://` or `https://`).
 * Format:
 * - "Opor / ข้อความที่ฝาก" -> { hasSlash: true, recipientPart: "Opor", commentPart: "ข้อความที่ฝาก" }
 * - "/ ข้อความส่วนกลาง"   -> { hasSlash: true, recipientPart: "", commentPart: "ข้อความส่วนกลาง" }
 * - "Opor"               -> { hasSlash: false, recipientPart: "Opor", commentPart: null }
 */
function splitRecipientAndCommentBySlash(trimmedMessage: string): {
  hasSlash: boolean;
  recipientPart: string;
  commentPart: string | null;
} {
  // Temporarily mask full URLs (https://...) and numeric dates/fractions (e.g. 1/2 or 07/11/2026)
  // so we don't mistakenly split inside a URL path or date
  const masked = trimmedMessage
    .replace(/https?:\/\/[^\s]+/gi, (m) => '_'.repeat(m.length))
    .replace(/\d+\/\d+(?:\/\d+)?/g, (m) => '_'.repeat(m.length));
  const slashIdx = masked.indexOf('/');

  if (slashIdx === -1) {
    return {
      hasSlash: false,
      recipientPart: trimmedMessage.trim(),
      commentPart: null,
    };
  }

  const recipientPart = trimmedMessage.slice(0, slashIdx).trim();
  const afterSlash = trimmedMessage.slice(slashIdx + 1).trim();
  return {
    hasSlash: true,
    recipientPart,
    commentPart: afterSlash.length > 0 ? afterSlash : null,
  };
}

/**
 * Matches a recipient string (such as "Opor" or "Opor, Somchai")
 * against active users' configured `line_aliases` (set by Admin on the website),
 * `user_id`, or `full_name`.
 */
function matchRecipientTokens(
  activeUsers: ActiveUserRecord[],
  rawRecipientPart: string
): ValidatedRecipient[] {
  const normalizedPart = rawRecipientPart
    .replace(/^@(?:to:)?/i, '')
    .replace(/^(?:ฝากให้|ถึง|ส่งให้|สำหรับ)\s+/i, '')
    .trim();

  if (!normalizedPart) {
    return [];
  }

  // Support multiple recipients separated by comma or "&" before "/" (e.g., "Opor, Somchai / งานกลุ่ม")
  const candidateNames = normalizedPart
    .split(/[,&]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const matchedById = new Map<number, ValidatedRecipient>();

  for (const candidate of candidateNames) {
    const candidateLower = candidate.toLowerCase();

    for (const u of activeUsers) {
      const aliasList = u.line_aliases
        .split(/[,;|]+/)
        .map((a) => a.trim())
        .filter(Boolean);

      const tokens = Array.from(
        new Set([...aliasList, u.user_id.trim(), u.full_name.trim()])
      ).filter(Boolean);

      for (const token of tokens) {
        if (token.toLowerCase() === candidateLower) {
          matchedById.set(u.id, {
            userPk: u.id,
            userId: u.user_id,
            fullName: u.full_name,
            matchedAlias: token,
          });
          break;
        }
      }
    }
  }

  return Array.from(matchedById.values());
}

/**
 * Resolves the target recipient(s) and separated comment from an accompanying LINE message.
 * Syntax:
 * - "Opor / ข้อความฝากถึงผู้รับ" -> PRIVATE (Opor) + attachedMessage = "ข้อความฝากถึงผู้รับ"
 * - "Opor"                     -> PRIVATE (Opor) + attachedMessage = null (ไม่มีข้อความฝาก)
 * - "/ ข้อความส่วนกลาง"         -> PUBLIC + attachedMessage = "ข้อความส่วนกลาง"
 * - "ข้อความทั่วไปที่ไม่ตรงชื่อใคร" -> PUBLIC + attachedMessage = "ข้อความทั่วไปที่ไม่ตรงชื่อใคร"
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

  // 1. If a custom syntax extractor is explicitly registered (e.g. automated test for custom syntax), try it first
  if (activeSyntaxExtractor) {
    const parsed = activeSyntaxExtractor(trimmed);
    if (parsed && parsed.candidateUserIds && parsed.candidateUserIds.length > 0) {
      const uniqueCandidateIds = Array.from(
        new Set(parsed.candidateUserIds.map((u) => u.trim()).filter(Boolean))
      );
      const matchedRecipients: ValidatedRecipient[] = [];

      const stmt = db.prepare(
        `SELECT id, user_id, full_name FROM users WHERE LOWER(user_id) = LOWER(?) AND status = 'ACTIVE' AND role = 'USER'`
      );

      for (const candidateId of uniqueCandidateIds) {
        const row = stmt.get(candidateId) as
          | { id: number; user_id: string; full_name: string }
          | undefined;
        if (row) {
          matchedRecipients.push({
            userPk: row.id,
            userId: row.user_id,
            fullName: row.full_name,
          });
        }
      }

      if (matchedRecipients.length > 0) {
        return {
          visibility: 'PRIVATE',
          recipients: matchedRecipients,
          attachedMessage: parsed.cleanedMessage ?? null,
          rawText: trimmed,
          statusNote: `Private (${matchedRecipients.map((r) => `${r.userId} ${r.fullName}`).join(', ')})`,
        };
      }

      return {
        visibility: 'PUBLIC',
        recipients: [],
        attachedMessage: parsed.cleanedMessage ?? trimmed,
        rawText: trimmed,
        statusNote: `Public (ไม่พบบัญชีผู้รับที่เปิดใช้งาน: ${uniqueCandidateIds.join(', ')})`,
      };
    }
  }

  const activeUsers = db
    .prepare(
      `SELECT id, user_id, full_name, COALESCE(line_aliases, '') AS line_aliases
       FROM users
       WHERE status = 'ACTIVE'`
    )
    .all() as unknown as ActiveUserRecord[];

  const { hasSlash, recipientPart, commentPart } = splitRecipientAndCommentBySlash(trimmed);

  // Case A: Message contains "/" -> e.g. "Opor / ตั๋วเครื่องบิน" or "/ เอกสารส่วนกลาง"
  if (hasSlash) {
    // "/ ข้อความ" -> Explicitly Public with Comment
    if (!recipientPart) {
      return {
        visibility: 'PUBLIC',
        recipients: [],
        attachedMessage: commentPart,
        rawText: trimmed,
        statusNote: 'Public (ส่วนกลาง)',
      };
    }

    const matched = matchRecipientTokens(activeUsers, recipientPart);
    if (matched.length > 0) {
      const labelList = matched.map((r) =>
        r.matchedAlias && r.matchedAlias.toLowerCase() !== r.userId.toLowerCase()
          ? `${r.userId} ${r.fullName} (${r.matchedAlias})`
          : `${r.userId} ${r.fullName}`
      );
      return {
        visibility: 'PRIVATE',
        recipients: matched,
        attachedMessage: commentPart,
        rawText: trimmed,
        statusNote: `Private (${labelList.join(', ')})`,
      };
    }

    // Before "/" did not match any active user -> fallback safely to PUBLIC and preserve comment
    return {
      visibility: 'PUBLIC',
      recipients: [],
      attachedMessage: commentPart ?? trimmed,
      rawText: trimmed,
      statusNote: `Public (ไม่พบผู้รับ "${recipientPart}" ในระบบ)`,
    };
  }

  // Case B: Message does NOT contain "/" -> Check if it's an exact recipient name ("Opor")
  const matchedWithoutSlash = matchRecipientTokens(activeUsers, recipientPart);
  if (matchedWithoutSlash.length > 0) {
    const labelList = matchedWithoutSlash.map((r) =>
      r.matchedAlias && r.matchedAlias.toLowerCase() !== r.userId.toLowerCase()
        ? `${r.userId} ${r.fullName} (${r.matchedAlias})`
        : `${r.userId} ${r.fullName}`
    );
    return {
      visibility: 'PRIVATE',
      recipients: matchedWithoutSlash,
      attachedMessage: null, // Only recipient name was provided -> no comment
      rawText: trimmed,
      statusNote: `Private (${labelList.join(', ')})`,
    };
  }

  // Case B2: Check if message uses newline (\n), pipe (|), colon (:), dash ( - ), or space after a known recipient name/alias
  // e.g., "Opor ตั๋วเครื่องบิน", "Opor : ตั๋วเครื่องบิน", "Opor - ตั๋วเครื่องบิน", "Opor\nตั๋วเครื่องบิน"
  const altSeparatorMatch = trimmed.match(/^([^\n|:]+?)(?:\s*[|:]\s*|\s+-\s+|\r?\n+)([\s\S]+)$/);
  if (altSeparatorMatch) {
    const candRec = altSeparatorMatch[1].trim();
    const candComment = altSeparatorMatch[2].trim();
    const matchedAlt = matchRecipientTokens(activeUsers, candRec);
    if (matchedAlt.length > 0) {
      const labelList = matchedAlt.map((r) =>
        r.matchedAlias && r.matchedAlias.toLowerCase() !== r.userId.toLowerCase()
          ? `${r.userId} ${r.fullName} (${r.matchedAlias})`
          : `${r.userId} ${r.fullName}`
      );
      return {
        visibility: 'PRIVATE',
        recipients: matchedAlt,
        attachedMessage: candComment || null,
        rawText: trimmed,
        statusNote: `Private (${labelList.join(', ')})`,
      };
    }
  }

  // Check if message starts with a known user alias / userId / fullName followed by whitespace + comment
  const cleanedPrefixTarget = trimmed
    .replace(/^@(?:to:)?/i, '')
    .replace(/^(?:ฝากให้|ถึง|ส่งให้|สำหรับ)\s+/i, '')
    .trim();

  for (const u of activeUsers) {
    const aliasList = u.line_aliases
      .split(/[,;|]+/)
      .map((a) => a.trim())
      .filter(Boolean);
    // Sort longer tokens first so full names match before shorter prefixes
    const tokens = Array.from(
      new Set([...aliasList, u.user_id.trim(), u.full_name.trim()])
    )
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

    for (const token of tokens) {
      const prefixRegex = new RegExp(`^${escapeRegex(token)}(?:\\s+|\\s*[,:-]\\s+)([\\s\\S]+)$`, 'i');
      const m = cleanedPrefixTarget.match(prefixRegex);
      if (m && m[1] && m[1].trim().length > 0) {
        const extractedComment = m[1].trim();
        const label =
          token.toLowerCase() !== u.user_id.toLowerCase()
            ? `${u.user_id} ${u.full_name} (${token})`
            : `${u.user_id} ${u.full_name}`;
        return {
          visibility: 'PRIVATE',
          recipients: [
            {
              userPk: u.id,
              userId: u.user_id,
              fullName: u.full_name,
              matchedAlias: token,
            },
          ],
          attachedMessage: extractedComment,
          rawText: trimmed,
          statusNote: `Private (${label})`,
        };
      }
    }
  }

  // Case C: Message has no "/" and does not match any user -> Public file with this message as Comment
  return {
    visibility: 'PUBLIC',
    recipients: [],
    attachedMessage: trimmed,
    rawText: trimmed,
    statusNote: 'Public (ส่วนกลาง)',
  };
}
