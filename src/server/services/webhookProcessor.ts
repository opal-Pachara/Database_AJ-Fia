import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getDb, runInTransaction } from '../db/connection.js';
import { appConfig } from '../config.js';
import {
  downloadLineContentToTemp,
  fetchLineUserProfile,
  formatBytes,
  sendLineReply,
} from './lineApi.js';
import {
  resolveRecipientsFromMessage,
  RecipientResolutionResult,
} from './recipientParser.js';
import { createNotificationsForIncomingItem } from './notificationService.js';
import { broadcastRealtimeEvent } from './realtimeEvents.js';
import {
  resolveSafeStoragePath,
  sanitizeDisplayFileName,
  sanitizeUserFolderId,
} from '../utils/disk.js';
import { extractUrlsFromText } from '../utils/urlExtractor.js';
import { writeSystemLog } from '../utils/logger.js';

export interface LineWebhookEvent {
  type: string;
  mode?: string;
  timestamp: number;
  webhookEventId: string;
  deliveryContext?: {
    isRedelivery?: boolean;
  };
  source?: {
    type: string;
    userId?: string;
    groupId?: string;
    roomId?: string;
  };
  replyToken?: string;
  message?: {
    id: string;
    type: string;
    text?: string;
    fileName?: string;
    fileSize?: number;
    quoteToken?: string;
    quotedMessageId?: string;
    imageSet?: {
      id: string;
      index: number;
      total: number;
    };
    contentProvider?: {
      type: string;
      originalContentUrl?: string;
      previewImageUrl?: string;
    };
  };
}

export interface LineWebhookPayload {
  destination?: string;
  events: LineWebhookEvent[];
}

interface PendingSenderCaption {
  text: string;
  messageId: string;
  createdAtMs: number;
  lastUsedAtMs: number;
  usedCount: number;
  imageSetId?: string | null;
}

const pendingSenderCaptions = new Map<string, PendingSenderCaption>();

export function clearPendingSenderCaptions(): void {
  pendingSenderCaptions.clear();
}

function consumePendingSenderCaption(
  senderLineUserId: string,
  imageSetId?: string | null
): {
  text: string;
  messageId: string;
} | null {
  if (!senderLineUserId) return null;
  const entry = pendingSenderCaptions.get(senderLineUserId);
  if (!entry) return null;

  const now = Date.now();
  const isExpired =
    entry.usedCount === 0
      ? now - entry.createdAtMs > 180 * 1000
      : now - entry.lastUsedAtMs > 10 * 1000;

  if (isExpired) {
    pendingSenderCaptions.delete(senderLineUserId);
    return null;
  }

  // If already used once, only reuse if part of the same LINE multi-image burst (imageSetId)
  if (entry.usedCount > 0 && (!imageSetId || entry.imageSetId !== imageSetId)) {
    pendingSenderCaptions.delete(senderLineUserId);
    return null;
  }

  entry.usedCount += 1;
  entry.lastUsedAtMs = now;
  entry.imageSetId = imageSetId || null;

  if (!imageSetId) {
    pendingSenderCaptions.delete(senderLineUserId);
  }

  return { text: entry.text, messageId: entry.messageId };
}

export function detectMagicBytesFormat(filePath?: string): {
  extension: string;
  mimeType: string;
} | null {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    if (bytesRead < 4) return null;

    // JPEG: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return { extension: 'jpg', mimeType: 'image/jpeg' };
    }
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    ) {
      return { extension: 'png', mimeType: 'image/png' };
    }
    // GIF: 47 49 46 38 ("GIF8")
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
      return { extension: 'gif', mimeType: 'image/gif' };
    }
    // WEBP: "RIFF" .... "WEBP"
    if (
      bytesRead >= 12 &&
      buf.toString('ascii', 0, 4) === 'RIFF' &&
      buf.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return { extension: 'webp', mimeType: 'image/webp' };
    }
    // PDF: "%PDF"
    if (buf.toString('ascii', 0, 4) === '%PDF') {
      return { extension: 'pdf', mimeType: 'application/pdf' };
    }
    // ISO Base Media File Format (MP4, MOV, M4A, HEIC): bytes 4..8 === "ftyp"
    if (bytesRead >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') {
      const brand = buf.toString('ascii', 8, 12).toLowerCase();
      if (brand.startsWith('m4a')) {
        return { extension: 'm4a', mimeType: 'audio/mp4' };
      }
      if (brand === 'qt  ') {
        return { extension: 'mov', mimeType: 'video/quicktime' };
      }
      return { extension: 'mp4', mimeType: 'video/mp4' };
    }
  } catch {
    // Ignore read error
  }
  return null;
}

export function detectFileCategoryAndPreview(
  mimeType: string,
  originalName?: string | null,
  messageType?: string | null,
  filePath?: string
): {
  category: 'PDF' | 'IMAGE' | 'DOCUMENT' | 'VIDEO' | 'AUDIO' | 'ARCHIVE' | 'OTHER';
  extension: string;
  effectiveMimeType: string;
  isPreviewable: number;
} {
  const rawExt = originalName ? path.extname(originalName).toLowerCase().replace(/^\./, '') : '';
  const extFromName = rawExt === 'bin' ? '' : rawExt;
  const cleanMime = (mimeType || '').split(';')[0].trim().toLowerCase();
  const magic = detectMagicBytesFormat(filePath);

  let extension = extFromName;
  let effectiveMimeType = cleanMime || 'application/octet-stream';

  if (!extension) {
    if (magic) {
      extension = magic.extension;
      if (
        !effectiveMimeType ||
        effectiveMimeType === 'application/octet-stream' ||
        effectiveMimeType === 'binary/octet-stream'
      ) {
        effectiveMimeType = magic.mimeType;
      }
    } else if (cleanMime === 'application/pdf') {
      extension = 'pdf';
    } else if (cleanMime === 'image/jpeg' || cleanMime === 'image/jpg') {
      extension = 'jpg';
    } else if (cleanMime === 'image/png') {
      extension = 'png';
    } else if (cleanMime === 'image/gif') {
      extension = 'gif';
    } else if (cleanMime === 'image/webp') {
      extension = 'webp';
    } else if (cleanMime === 'image/heic' || cleanMime === 'image/heif') {
      extension = 'jpg';
      effectiveMimeType = 'image/jpeg';
    } else if (cleanMime === 'video/mp4') {
      extension = 'mp4';
    } else if (cleanMime === 'video/quicktime') {
      extension = 'mov';
    } else if (cleanMime === 'video/webm') {
      extension = 'webm';
    } else if (
      cleanMime === 'audio/m4a' ||
      cleanMime === 'audio/mp4' ||
      cleanMime === 'audio/x-m4a' ||
      cleanMime === 'audio/aac'
    ) {
      extension = 'm4a';
    } else if (cleanMime === 'audio/mpeg' || cleanMime === 'audio/mp3') {
      extension = 'mp3';
    } else if (messageType === 'image') {
      extension = 'jpg';
      effectiveMimeType = 'image/jpeg';
    } else if (messageType === 'video') {
      extension = 'mp4';
      effectiveMimeType = 'video/mp4';
    } else if (messageType === 'audio') {
      extension = 'm4a';
      effectiveMimeType = 'audio/mp4';
    } else {
      extension = 'bin';
    }
  }

  // Ensure proper MIME type when extension is known
  if (
    effectiveMimeType === 'application/octet-stream' ||
    effectiveMimeType === 'binary/octet-stream'
  ) {
    if (extension === 'jpg' || extension === 'jpeg') effectiveMimeType = 'image/jpeg';
    else if (extension === 'png') effectiveMimeType = 'image/png';
    else if (extension === 'gif') effectiveMimeType = 'image/gif';
    else if (extension === 'webp') effectiveMimeType = 'image/webp';
    else if (extension === 'pdf') effectiveMimeType = 'application/pdf';
    else if (extension === 'mp4') effectiveMimeType = 'video/mp4';
    else if (extension === 'mov') effectiveMimeType = 'video/quicktime';
    else if (extension === 'webm') effectiveMimeType = 'video/webm';
    else if (extension === 'm4a') effectiveMimeType = 'audio/mp4';
    else if (extension === 'mp3') effectiveMimeType = 'audio/mpeg';
  }

  // Normalize extension for safe disk storage
  extension = extension.replace(/[^a-z0-9]/g, '').slice(0, 12) || 'bin';

  if (effectiveMimeType === 'application/pdf' || extension === 'pdf') {
    return {
      category: 'PDF',
      extension: 'pdf',
      effectiveMimeType: 'application/pdf',
      isPreviewable: 1,
    };
  }

  if (
    effectiveMimeType.startsWith('image/') ||
    ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(extension) ||
    messageType === 'image'
  ) {
    const finalExt = extension === 'bin' ? 'jpg' : extension;
    const finalMime =
      effectiveMimeType.startsWith('image/') ? effectiveMimeType : 'image/jpeg';
    return {
      category: 'IMAGE',
      extension: finalExt,
      effectiveMimeType: finalMime,
      isPreviewable: 1,
    };
  }

  if (
    effectiveMimeType.startsWith('video/') ||
    ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(extension) ||
    messageType === 'video'
  ) {
    const finalExt = extension === 'bin' ? 'mp4' : extension;
    const finalMime =
      effectiveMimeType.startsWith('video/') ? effectiveMimeType : 'video/mp4';
    return {
      category: 'VIDEO',
      extension: finalExt,
      effectiveMimeType: finalMime,
      isPreviewable: 1,
    };
  }

  if (
    effectiveMimeType.startsWith('audio/') ||
    ['mp3', 'm4a', 'wav', 'aac', 'ogg'].includes(extension) ||
    messageType === 'audio'
  ) {
    const finalExt = extension === 'bin' ? 'm4a' : extension;
    const finalMime =
      effectiveMimeType.startsWith('audio/') ? effectiveMimeType : 'audio/mp4';
    return {
      category: 'AUDIO',
      extension: finalExt,
      effectiveMimeType: finalMime,
      isPreviewable: 1,
    };
  }

  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) {
    return { category: 'ARCHIVE', extension, effectiveMimeType, isPreviewable: 0 };
  }

  if (
    [
      'doc',
      'docx',
      'xls',
      'xlsx',
      'ppt',
      'pptx',
      'txt',
      'csv',
      'rtf',
      'odt',
      'ods',
      'odp',
    ].includes(extension)
  ) {
    return { category: 'DOCUMENT', extension, effectiveMimeType, isPreviewable: 0 };
  }

  return { category: 'OTHER', extension, effectiveMimeType, isPreviewable: 0 };
}

function generateDefaultFileName(messageType: string, messageId: string, timestamp: number, ext: string): string {
  const dt = new Date(timestamp || Date.now())
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')
    .replace('T', '_');
  const prefix =
    messageType === 'image'
      ? 'LINE_IMAGE'
      : messageType === 'video'
      ? 'LINE_VIDEO'
      : messageType === 'audio'
      ? 'LINE_AUDIO'
      : 'LINE_FILE';
  return `${prefix}_${dt}_${messageId.slice(-6)}.${ext}`;
}

function updateWebhookStatus(
  eventPk: number,
  status:
    | 'RECEIVED'
    | 'VALIDATING'
    | 'DOWNLOADING'
    | 'STORING'
    | 'DATABASE_COMMITTED'
    | 'SUCCESS'
    | 'FAILED',
  errorMessage?: string | null,
  replyStatus?: 'PENDING' | 'SENT' | 'EXPIRED' | 'FAILED' | 'NOT_APPLICABLE'
): void {
  const db = getDb();
  const isTerminal = status === 'SUCCESS' || status === 'FAILED';
  db.prepare(
    `UPDATE line_webhook_events
     SET processing_status = ?,
         error_message = COALESCE(?, error_message),
         reply_status = COALESCE(?, reply_status),
         completed_at = CASE WHEN ? = 1 THEN datetime('now') ELSE completed_at END
     WHERE id = ?`
  ).run(status, errorMessage ?? null, replyStatus ?? null, isTerminal ? 1 : 0, eventPk);
}

/**
 * Processes an entire webhook payload from LINE Platform.
 * Supports safe batch pairing (when iOS Share Sheet sends file + text in the same webhook payload)
 * and quotedMessageId pairing.
 */
export async function processLineWebhookPayload(payload: LineWebhookPayload): Promise<void> {
  if (!payload || !Array.isArray(payload.events) || payload.events.length === 0) {
    return;
  }

  // Detect if this single webhook payload contains a paired text + media/file from the same sender
  // (e.g., iOS Share Sheet "Add a message" sent together with a file/image)
  let sharedBatchText: string | null = null;
  let sharedBatchTextEventId: string | null = null;
  const batchHintId = crypto.randomUUID();

  const messageEvents = payload.events.filter((e) => e.type === 'message' && e.message);
  const mediaEvents = messageEvents.filter((e) =>
    ['file', 'image', 'video', 'audio'].includes(e.message?.type || '')
  );
  const textEvents = messageEvents.filter((e) => e.message?.type === 'text');

  if (mediaEvents.length > 0 && textEvents.length === 1) {
    const candidateText = (textEvents[0].message?.text || '').trim();
    const urlsInCandidate = extractUrlsFromText(candidateText);
    // If the accompanying text is not purely a standalone URL, pair it as the caption for the media in this batch
    if (candidateText && urlsInCandidate.length === 0) {
      sharedBatchText = candidateText;
      sharedBatchTextEventId = textEvents[0].webhookEventId;
    }
  }

  for (const event of payload.events) {
    await processSingleWebhookEvent(event, {
      pairedBatchText: sharedBatchText,
      isPairedCaptionTextEvent: event.webhookEventId === sharedBatchTextEventId,
      batchHintId: mediaEvents.length > 1 ? batchHintId : null,
    });
  }
}

async function processSingleWebhookEvent(
  event: LineWebhookEvent,
  context: {
    pairedBatchText: string | null;
    isPairedCaptionTextEvent: boolean;
    batchHintId: string | null;
  }
): Promise<void> {
  const db = getDb();
  const webhookEventId = event.webhookEventId || crypto.randomUUID();
  const isRedelivery = event.deliveryContext?.isRedelivery ? 1 : 0;
  const sourceType = event.source?.type || 'unknown';
  const senderLineUserId = event.source?.userId || 'unknown';
  const messageId = event.message?.id || null;
  const messageType = event.message?.type || null;

  // 1. Idempotency Check (Section 7 ข้อ 3, 4, 5: ป้องกันการประมวลผล Event ซ้ำ / รองรับ Webhook Retry)
  const existingEvent = db
    .prepare(
      `SELECT id, processing_status FROM line_webhook_events WHERE webhook_event_id = ? OR (line_message_id IS NOT NULL AND line_message_id = ?)`
    )
    .get(webhookEventId, messageId) as { id: number; processing_status: string } | undefined;

  if (existingEvent) {
    writeSystemLog({
      level: 'INFO',
      category: 'WEBHOOK',
      action: 'DUPLICATE_WEBHOOK_IGNORED',
      actorUserId: senderLineUserId,
      details: {
        webhookEventId,
        messageId,
        isRedelivery,
        previousStatus: existingEvent.processing_status,
      },
    });
    return;
  }

  // 2. Record initial state = RECEIVED
  const insertRes = db
    .prepare(
      `INSERT INTO line_webhook_events (
        webhook_event_id, line_message_id, quote_token, quoted_message_id,
        image_set_id, sender_line_user_id, source_type, event_type,
        message_type, raw_payload, processing_status, is_redelivery,
        reply_status, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECEIVED', ?, 'PENDING', datetime('now'))`
    )
    .run(
      webhookEventId,
      messageId,
      event.message?.quoteToken ?? null,
      event.message?.quotedMessageId ?? null,
      event.message?.imageSet?.id ?? null,
      senderLineUserId,
      sourceType,
      event.type,
      messageType,
      JSON.stringify(event),
      isRedelivery
    );

  const eventPk = Number(insertRes.lastInsertRowid);

  // 3. State = VALIDATING
  updateWebhookStatus(eventPk, 'VALIDATING');

  // REQ-02: รองรับการส่งไฟล์ผ่านแชทส่วนตัว 1-on-1 เท่านั้น ไม่รองรับ Group Chat หรือ Room Chat
  if (sourceType !== 'user') {
    const errMsg = `UNSUPPORTED_SOURCE_TYPE: ระบบรองรับเฉพาะแชทส่วนตัว 1-on-1 เท่านั้น (ได้รับจาก ${sourceType})`;
    updateWebhookStatus(eventPk, 'FAILED', errMsg, 'NOT_APPLICABLE');
    writeSystemLog({
      level: 'WARN',
      category: 'WEBHOOK',
      action: 'REJECTED_NON_USER_CHAT',
      actorUserId: senderLineUserId,
      details: { sourceType, webhookEventId },
    });
    return;
  }

  // REQ-02: ผู้ส่งไฟล์คืออาจารย์เพียงคนเดียว (ตรวจสอบ ALLOWED_SENDER_LINE_USER_ID หากตั้งค่าไว้)
  if (
    appConfig.line.allowedSenderLineUserId &&
    senderLineUserId !== appConfig.line.allowedSenderLineUserId
  ) {
    const errMsg = `UNAUTHORIZED_SENDER: LINE userId (${senderLineUserId}) ไม่ได้รับอนุญาตให้ส่งไฟล์เข้าสู่ระบบ`;
    const replyRes = await sendLineReply(
      event.replyToken,
      `❌ ปฏิเสธการรับข้อมูล\nสาเหตุ: บัญชี LINE นี้ไม่ได้รับอนุญาตให้ส่งไฟล์เข้าสู่ระบบ`
    );
    updateWebhookStatus(eventPk, 'FAILED', errMsg, replyRes.status);
    writeSystemLog({
      level: 'SECURITY',
      category: 'WEBHOOK',
      action: 'UNAUTHORIZED_LINE_SENDER_BLOCKED',
      actorUserId: senderLineUserId,
      details: { webhookEventId },
    });
    return;
  }

  // Ignore non-message events (e.g., follow/unfollow) after logging
  if (event.type !== 'message' || !event.message) {
    updateWebhookStatus(eventPk, 'SUCCESS', null, 'NOT_APPLICABLE');
    return;
  }

  // If this text event was already consumed as a same-batch caption for an accompanying file
  if (context.isPairedCaptionTextEvent) {
    updateWebhookStatus(eventPk, 'SUCCESS', null, 'NOT_APPLICABLE');
    return;
  }

  const receivedAtIso = new Date(event.timestamp || Date.now()).toISOString();

  // Handle Media / File messages: file, image, video, audio
  if (['file', 'image', 'video', 'audio'].includes(messageType || '')) {
    await handleIncomingMediaFileEvent({
      event,
      eventPk,
      receivedAtIso,
      pairedBatchText: context.pairedBatchText,
      batchHintId: event.message.imageSet?.id || context.batchHintId,
    });
    return;
  }

  // Handle Text messages (URLs or Quote-Reply to an existing file)
  if (messageType === 'text') {
    await handleIncomingTextEvent({
      event,
      eventPk,
      receivedAtIso,
    });
    return;
  }

  // Other message types (sticker, location, etc.)
  const unsupportedMsg = `ไม่รองรับข้อมูลประเภท "${messageType}" (รองรับเฉพาะไฟล์ เอกสาร รูปภาพ วิดีโอ เสียง และ URL)`;
  const replyRes = await sendLineReply(
    event.replyToken,
    `⚠️ ระบบไม่รองรับข้อความประเภท "${messageType}"\nสถานะ: ไม่ได้จัดเก็บข้อมูล`
  );
  updateWebhookStatus(eventPk, 'FAILED', unsupportedMsg, replyRes.status);
}

async function handleIncomingMediaFileEvent(params: {
  event: LineWebhookEvent;
  eventPk: number;
  receivedAtIso: string;
  pairedBatchText: string | null;
  batchHintId: string | null;
}): Promise<void> {
  const { event, eventPk, receivedAtIso, pairedBatchText, batchHintId } = params;
  const db = getDb();
  const message = event.message!;
  const messageId = message.id;
  const messageType = message.type;
  const declaredFileSize = message.fileSize;
  const rawOriginalName = message.fileName;

  // Determine if there is a deterministic accompanying text message:
  // 1. Via same-batch webhook payload (from iOS Share Sheet)
  // 2. Via quotedMessageId pointing to a previous text message from the teacher
  // 3. Via preceding text message sent by the same teacher (e.g., typing "Opor" then sending the file)
  let attachedText: string | null = pairedBatchText;
  let pairedMessageIdHint: string | null = null;

  if (!attachedText && message.quotedMessageId) {
    const quotedRow = db
      .prepare(
        `SELECT raw_payload FROM line_webhook_events
         WHERE line_message_id = ? AND sender_line_user_id = ? AND message_type = 'text'`
      )
      .get(message.quotedMessageId, event.source?.userId || '') as { raw_payload: string } | undefined;

    if (quotedRow) {
      try {
        const parsedQuote = JSON.parse(quotedRow.raw_payload) as LineWebhookEvent;
        if (parsedQuote.message?.text) {
          attachedText = parsedQuote.message.text.trim();
          pairedMessageIdHint = message.quotedMessageId;
        }
      } catch {
        // Ignore parse error
      }
    }
  }

  if (!attachedText && event.source?.userId) {
    const pending = consumePendingSenderCaption(
      event.source.userId,
      event.message?.imageSet?.id || null
    );
    if (pending) {
      attachedText = pending.text;
      pairedMessageIdHint = pending.messageId;
    }
  }

  // Pre-resolve recipient for error reporting if known
  let preliminaryResolution: RecipientResolutionResult = resolveRecipientsFromMessage(
    db,
    attachedText
  );

  const senderLineUserId = event.source?.userId || 'unknown';
  const uploaderProfile = await fetchLineUserProfile(senderLineUserId);

  const fileUuid = crypto.randomUUID();
  const tempFilePath = path.join(appConfig.paths.tempDir, `${fileUuid}.part`);

  try {
    // 4. State = DOWNLOADING
    updateWebhookStatus(eventPk, 'DOWNLOADING');

    const downloadResult = await downloadLineContentToTemp({
      messageId,
      tempFilePath,
      declaredFileSize,
    });

    // Re-check pendingSenderCaption in case the accompanying text webhook arrived while the file was downloading
    if (!attachedText && event.source?.userId) {
      const latePending = consumePendingSenderCaption(
        event.source.userId,
        event.message?.imageSet?.id || null
      );
      if (latePending) {
        attachedText = latePending.text;
        pairedMessageIdHint = latePending.messageId;
        preliminaryResolution = resolveRecipientsFromMessage(db, attachedText);
      }
    }

    // 5. State = STORING
    updateWebhookStatus(eventPk, 'STORING');

    const { category, extension, effectiveMimeType, isPreviewable } =
      detectFileCategoryAndPreview(
        downloadResult.mimeType,
        rawOriginalName ? sanitizeDisplayFileName(rawOriginalName) : null,
        messageType,
        tempFilePath
      );

    const finalOriginalName = rawOriginalName
      ? sanitizeDisplayFileName(rawOriginalName)
      : generateDefaultFileName(messageType, messageId, event.timestamp, extension);

    const storedFilename = `${fileUuid}.${extension}`;

    // Determine final storage folder (PRIVATE vs PUBLIC)
    let relativeStoragePath: string;
    let absoluteFinalPath: string;

    if (
      preliminaryResolution.visibility === 'PRIVATE' &&
      preliminaryResolution.recipients.length > 0
    ) {
      const primaryUserFolder = sanitizeUserFolderId(preliminaryResolution.recipients[0].userId);
      const userPrivateDir = resolveSafeStoragePath(
        appConfig.paths.privateStorage,
        primaryUserFolder
      );
      if (!fs.existsSync(userPrivateDir)) {
        fs.mkdirSync(userPrivateDir, { recursive: true });
      }
      relativeStoragePath = path.posix.join('private', primaryUserFolder, storedFilename);
      absoluteFinalPath = resolveSafeStoragePath(userPrivateDir, storedFilename);
    } else {
      relativeStoragePath = path.posix.join('public', storedFilename);
      absoluteFinalPath = resolveSafeStoragePath(appConfig.paths.publicStorage, storedFilename);
    }

    // Move file atomically from temp/ to storage/
    fs.renameSync(tempFilePath, absoluteFinalPath);

    // 6. State = DATABASE_COMMITTED (Atomic transaction for File + Recipients + Notifications)
    runInTransaction(db, () => {
      const fileInsert = db
        .prepare(
          `INSERT INTO files (
            file_uuid, webhook_event_pk, line_message_id, original_name,
            stored_filename, relative_storage_path, mime_type, file_extension,
            file_category, file_size_bytes, sha256_checksum, attached_message,
            recipient_raw_text, uploader_line_user_id, uploader_name, uploader_picture_url,
            visibility, is_previewable, status, received_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, datetime('now'))`
        )
        .run(
          fileUuid,
          eventPk,
          messageId,
          finalOriginalName,
          storedFilename,
          relativeStoragePath,
          effectiveMimeType,
          extension,
          category,
          downloadResult.sizeBytes,
          downloadResult.sha256Checksum,
          preliminaryResolution.attachedMessage,
          preliminaryResolution.rawText,
          senderLineUserId,
          uploaderProfile.displayName,
          uploaderProfile.pictureUrl,
          preliminaryResolution.visibility,
          isPreviewable,
          receivedAtIso
        );

      const filePk = Number(fileInsert.lastInsertRowid);

      if (preliminaryResolution.visibility === 'PRIVATE') {
        const insertRecipientStmt = db.prepare(
          `INSERT INTO file_recipients (file_pk, user_pk, recipient_user_id, assigned_at)
           VALUES (?, ?, ?, datetime('now'))`
        );
        for (const rec of preliminaryResolution.recipients) {
          insertRecipientStmt.run(filePk, rec.userPk, rec.userId);
        }
      }

      createNotificationsForIncomingItem(db, {
        itemType: 'FILE',
        filePk,
        itemUuid: fileUuid,
        title: finalOriginalName,
        detailMessage: preliminaryResolution.attachedMessage,
        fileType: category,
        fileSizeBytes: downloadResult.sizeBytes,
        visibility: preliminaryResolution.visibility,
        recipients: preliminaryResolution.recipients,
        receivedAt: receivedAtIso,
        eventBatchHint: batchHintId || pairedMessageIdHint || message.quotedMessageId || null,
      });

      updateWebhookStatus(eventPk, 'DATABASE_COMMITTED');
    });

    // Immediately push Real-Time SSE notification to connected web browsers
    broadcastRealtimeEvent({
      type: 'FILE_RECEIVED',
      itemUuid: fileUuid,
      title: finalOriginalName,
      fileCategory: category,
      visibility: preliminaryResolution.visibility,
      recipientUserIds: preliminaryResolution.recipients.map((r) => r.userId),
      attachedMessage: preliminaryResolution.attachedMessage,
      fileSizeBytes: downloadResult.sizeBytes,
      uploaderName: uploaderProfile.displayName,
      uploaderPictureUrl: uploaderProfile.pictureUrl,
      timestamp: receivedAtIso,
    });

    // 7. Send Reply via LINE OA ONLY AFTER Disk + DB Commit have succeeded (REQ-08)
    const replyText = [
      `✅ จัดเก็บไฟล์สำเร็จ`,
      `• ชื่อไฟล์: ${finalOriginalName}`,
      `• ผู้รับไฟล์: ${preliminaryResolution.statusNote}`,
      `• ข้อความที่ฝาก (Comment): ${preliminaryResolution.attachedMessage || '- (ไม่มีข้อความฝาก)'}`,
      `• ขนาดไฟล์: ${formatBytes(downloadResult.sizeBytes)}`,
      `• สถานะ: บันทึกไฟล์และฐานข้อมูลเรียบร้อยแล้ว`,
    ].join('\n');

    const replyRes = await sendLineReply(event.replyToken, replyText);

    // 8. State = SUCCESS
    updateWebhookStatus(eventPk, 'SUCCESS', null, replyRes.status);

    writeSystemLog({
      level: 'INFO',
      category: 'FILE',
      action: 'FILE_STORED_SUCCESS',
      actorUserId: event.source?.userId || null,
      details: {
        fileUuid,
        originalName: finalOriginalName,
        sizeBytes: downloadResult.sizeBytes,
        visibility: preliminaryResolution.visibility,
        recipients: preliminaryResolution.recipients.map((r) => r.userId),
        replyStatus: replyRes.status,
      },
    });
  } catch (err) {
    // Cleanup temp file if still present
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    } catch {
      // Ignore cleanup error
    }

    const errorReason = err instanceof Error ? err.message : String(err);
    const knownName = rawOriginalName ? sanitizeDisplayFileName(rawOriginalName) : `ไม่ทราบชื่อ (${messageType})`;
    const knownSize =
      typeof declaredFileSize === 'number' ? formatBytes(declaredFileSize) : 'ไม่ทราบขนาด';

    // REQ-08: กรณีล้มเหลว ต้องแจ้ง ชื่อไฟล์ (หากทราบ), ผู้รับไฟล์ (หากทราบ), ขนาดไฟล์ (หากทราบ), สาเหตุที่ล้มเหลว, สถานะการดำเนินการ
    const failReplyText = [
      `❌ การจัดเก็บไฟล์ล้มเหลว`,
      `• ชื่อไฟล์: ${knownName}`,
      `• ผู้รับไฟล์: ${preliminaryResolution.statusNote}`,
      `• ขนาดไฟล์: ${knownSize}`,
      `• สาเหตุ: ${errorReason}`,
      `• สถานะ: ยกเลิกการจัดเก็บไฟล์`,
    ].join('\n');

    const replyRes = await sendLineReply(event.replyToken, failReplyText);
    updateWebhookStatus(eventPk, 'FAILED', errorReason, replyRes.status);

    writeSystemLog({
      level: 'ERROR',
      category: 'FILE',
      action: 'FILE_STORE_FAILED',
      actorUserId: event.source?.userId || null,
      details: {
        webhookEventId: event.webhookEventId,
        messageId,
        knownName,
        errorReason,
        replyStatus: replyRes.status,
      },
    });
  }
}

async function handleIncomingTextEvent(params: {
  event: LineWebhookEvent;
  eventPk: number;
  receivedAtIso: string;
}): Promise<void> {
  const { event, eventPk, receivedAtIso } = params;
  const db = getDb();
  const message = event.message!;
  const text = (message.text || '').trim();

  // Case A: Check if this text message quotes/replies to an already uploaded file in `files`
  // (Safe Pairing Mechanism when teacher sends a file first from iOS Share Sheet, then swipes to Reply on that file in LINE)
  if (message.quotedMessageId) {
    const quotedFile = db
      .prepare(
        `SELECT id, file_uuid, original_name, stored_filename, relative_storage_path,
                file_category, file_size_bytes, visibility
         FROM files
         WHERE line_message_id = ? AND status = 'ACTIVE'`
      )
      .get(message.quotedMessageId) as
      | {
          id: number;
          file_uuid: string;
          original_name: string;
          stored_filename: string;
          relative_storage_path: string;
          file_category: string;
          file_size_bytes: number;
          visibility: 'PRIVATE' | 'PUBLIC';
        }
      | undefined;

    if (quotedFile) {
      const resolution = resolveRecipientsFromMessage(db, text);
      let newRelativePath = quotedFile.relative_storage_path;

      // If resolution changes a PUBLIC file to PRIVATE, move the file on disk into storage/private/{USER_ID}/
      if (
        resolution.visibility === 'PRIVATE' &&
        resolution.recipients.length > 0 &&
        quotedFile.visibility === 'PUBLIC'
      ) {
        const currentAbsPath = resolveSafeStoragePath(
          appConfig.paths.storage,
          quotedFile.relative_storage_path
        );
        const primaryUserFolder = sanitizeUserFolderId(resolution.recipients[0].userId);
        const userPrivateDir = resolveSafeStoragePath(
          appConfig.paths.privateStorage,
          primaryUserFolder
        );
        if (!fs.existsSync(userPrivateDir)) {
          fs.mkdirSync(userPrivateDir, { recursive: true });
        }
        const newAbsPath = resolveSafeStoragePath(userPrivateDir, quotedFile.stored_filename);
        if (fs.existsSync(currentAbsPath) && currentAbsPath !== newAbsPath) {
          fs.renameSync(currentAbsPath, newAbsPath);
        }
        newRelativePath = path.posix.join('private', primaryUserFolder, quotedFile.stored_filename);
      }

      runInTransaction(db, () => {
        db.prepare(
          `UPDATE files
           SET attached_message = ?,
               recipient_raw_text = ?,
               visibility = ?,
               relative_storage_path = ?
           WHERE id = ?`
        ).run(
          resolution.attachedMessage,
          resolution.rawText,
          resolution.visibility,
          newRelativePath,
          quotedFile.id
        );

        if (resolution.visibility === 'PRIVATE') {
          db.prepare(`DELETE FROM file_recipients WHERE file_pk = ?`).run(quotedFile.id);
          const insertRec = db.prepare(
            `INSERT INTO file_recipients (file_pk, user_pk, recipient_user_id, assigned_at)
             VALUES (?, ?, ?, datetime('now'))`
          );
          for (const rec of resolution.recipients) {
            insertRec.run(quotedFile.id, rec.userPk, rec.userId);
          }

          createNotificationsForIncomingItem(db, {
            itemType: 'FILE',
            filePk: quotedFile.id,
            itemUuid: quotedFile.file_uuid,
            title: quotedFile.original_name,
            detailMessage: resolution.attachedMessage,
            fileType: quotedFile.file_category,
            fileSizeBytes: quotedFile.file_size_bytes,
            visibility: 'PRIVATE',
            recipients: resolution.recipients,
            receivedAt: receivedAtIso,
            eventBatchHint: message.quotedMessageId,
          });
        } else {
          db.prepare(`UPDATE notifications SET detail_message = ? WHERE file_pk = ?`).run(
            resolution.attachedMessage,
            quotedFile.id
          );
        }

        updateWebhookStatus(eventPk, 'DATABASE_COMMITTED');
      });

      broadcastRealtimeEvent({
        type: 'FILE_UPDATED',
        itemUuid: quotedFile.file_uuid,
        title: quotedFile.original_name,
        fileCategory: quotedFile.file_category,
        visibility: resolution.visibility,
        recipientUserIds: resolution.recipients.map((r) => r.userId),
        attachedMessage: resolution.attachedMessage,
        fileSizeBytes: quotedFile.file_size_bytes,
        timestamp: receivedAtIso,
      });

      const replyText = [
        `✅ อัปเดตผู้รับและข้อความที่ฝากของไฟล์สำเร็จ`,
        `• ชื่อไฟล์: ${quotedFile.original_name}`,
        `• ผู้รับไฟล์: ${resolution.statusNote}`,
        `• ข้อความที่ฝาก (Comment): ${resolution.attachedMessage || '- (ไม่มีข้อความฝาก)'}`,
        `• ขนาดไฟล์: ${formatBytes(quotedFile.file_size_bytes)}`,
      ].join('\n');

      const replyRes = await sendLineReply(event.replyToken, replyText);
      updateWebhookStatus(eventPk, 'SUCCESS', null, replyRes.status);
      return;
    }
  }

  // Case B: Check if the text message contains URLs (REQ-14: การจัดการ URL)
  // ห้ามดาวน์โหลดเนื้อหาจาก URL มาเก็บใน Server / URL ต้องถูกจัดการเป็นข้อมูล Link ไม่ใช่ Binary File
  const extractedUrls = extractUrlsFromText(text);

  if (extractedUrls.length > 0) {
    const resolution = resolveRecipientsFromMessage(db, text);
    const senderLineUserId = event.source?.userId || 'unknown';
    const uploaderProfile = await fetchLineUserProfile(senderLineUserId);

    try {
      updateWebhookStatus(eventPk, 'STORING');

      const insertedUrls: string[] = [];

      runInTransaction(db, () => {
        const insertUrlStmt = db.prepare(
          `INSERT INTO url_records (
            url_uuid, webhook_event_pk, line_message_id, url,
            attached_message, uploader_line_user_id, uploader_name, uploader_picture_url,
            visibility, status, received_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, datetime('now'))`
        );

        const insertUrlRecStmt = db.prepare(
          `INSERT INTO url_recipients (url_pk, user_pk, recipient_user_id, assigned_at)
           VALUES (?, ?, ?, datetime('now'))`
        );

        for (const urlItem of extractedUrls) {
          const urlUuid = crypto.randomUUID();
          const res = insertUrlStmt.run(
            urlUuid,
            eventPk,
            message.id,
            urlItem,
            resolution.attachedMessage,
            senderLineUserId,
            uploaderProfile.displayName,
            uploaderProfile.pictureUrl,
            resolution.visibility,
            receivedAtIso
          );
          const urlPk = Number(res.lastInsertRowid);

          if (resolution.visibility === 'PRIVATE') {
            for (const rec of resolution.recipients) {
              insertUrlRecStmt.run(urlPk, rec.userPk, rec.userId);
            }
          }

          // Save lightweight link metadata JSON in storage/urls/ (NOT fetching the remote webpage!)
          const urlMetaFile = resolveSafeStoragePath(
            appConfig.paths.urlStorage,
            `${urlUuid}.json`
          );
          fs.writeFileSync(
            urlMetaFile,
            JSON.stringify(
              {
                urlUuid,
                url: urlItem,
                attachedMessage: resolution.attachedMessage,
                uploaderName: uploaderProfile.displayName,
                uploaderPictureUrl: uploaderProfile.pictureUrl,
                visibility: resolution.visibility,
                receivedAt: receivedAtIso,
              },
              null,
              2
            ),
            'utf8'
          );

          createNotificationsForIncomingItem(db, {
            itemType: 'URL',
            urlPk,
            itemUuid: urlUuid,
            title: urlItem,
            detailMessage: resolution.attachedMessage,
            fileType: 'URL',
            fileSizeBytes: null,
            visibility: resolution.visibility,
            recipients: resolution.recipients,
            receivedAt: receivedAtIso,
            eventBatchHint: message.id,
          });

          insertedUrls.push(urlItem);
        }

        updateWebhookStatus(eventPk, 'DATABASE_COMMITTED');
      });

      broadcastRealtimeEvent({
        type: 'URL_RECEIVED',
        itemUuid: message.id,
        title: insertedUrls[0] || text,
        fileCategory: 'URL',
        visibility: resolution.visibility,
        recipientUserIds: resolution.recipients.map((r) => r.userId),
        attachedMessage: resolution.attachedMessage,
        fileSizeBytes: null,
        uploaderName: uploaderProfile.displayName,
        uploaderPictureUrl: uploaderProfile.pictureUrl,
        timestamp: receivedAtIso,
      });

      const replyText = [
        `✅ บันทึกลิงก์ (URL) สำเร็จ (${insertedUrls.length} รายการ)`,
        `• ลิงก์: ${insertedUrls.join(', ')}`,
        `• ผู้รับ: ${resolution.statusNote}`,
        `• ข้อความที่ฝาก (Comment): ${resolution.attachedMessage || '- (ไม่มีข้อความฝาก)'}`,
        `• สถานะ: บันทึกเป็นข้อมูล Link เรียบร้อยแล้ว`,
      ].join('\n');

      const replyRes = await sendLineReply(event.replyToken, replyText);
      updateWebhookStatus(eventPk, 'SUCCESS', null, replyRes.status);

      writeSystemLog({
        level: 'INFO',
        category: 'FILE',
        action: 'URL_RECORDED_SUCCESS',
        actorUserId: event.source?.userId || null,
        details: { urls: insertedUrls, visibility: resolution.visibility },
      });
      return;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const failText = [
        `❌ บันทึกลิงก์ (URL) ล้มเหลว`,
        `• ลิงก์: ${extractedUrls.join(', ')}`,
        `• ผู้รับ: ${resolution.statusNote}`,
        `• สาเหตุ: ${errMsg}`,
        `• สถานะ: ล้มเหลว`,
      ].join('\n');
      const replyRes = await sendLineReply(event.replyToken, failText);
      updateWebhookStatus(eventPk, 'FAILED', errMsg, replyRes.status);
      return;
    }
  }

  // Case C: Standalone text message without URLs and not quoting a file
  const senderId = event.source?.userId || '';
  const previewResolution = resolveRecipientsFromMessage(db, text);

  // Check if the sender JUST uploaded one or more uncaptioned media files immediately before this text message (within 60s)
  // (e.g., LINE sending media webhook first and text webhook right after, or user sending a file then typing the caption right after)
  if (senderId && text) {
    const recentEvents = db
      .prepare(
        `SELECT id, message_type, processing_status
         FROM line_webhook_events
         WHERE sender_line_user_id = ?
           AND id < ?
           AND received_at >= datetime('now', '-60 seconds')
         ORDER BY id DESC
         LIMIT 10`
      )
      .all(senderId, eventPk) as Array<{
      id: number;
      message_type: string | null;
      processing_status: string;
    }>;

    const uncaptionedFilesToUpdate: Array<{
      id: number;
      file_uuid: string;
      original_name: string;
      stored_filename: string;
      relative_storage_path: string;
      file_category: string;
      file_size_bytes: number;
      visibility: 'PRIVATE' | 'PUBLIC';
    }> = [];

    for (const ev of recentEvents) {
      if (
        ['file', 'image', 'video', 'audio'].includes(ev.message_type || '') &&
        ev.processing_status === 'SUCCESS'
      ) {
        const fileRow = db
          .prepare(
            `SELECT id, file_uuid, original_name, stored_filename, relative_storage_path,
                    file_category, file_size_bytes, visibility, attached_message, recipient_raw_text
             FROM files
             WHERE webhook_event_pk = ? AND status = 'ACTIVE'`
          )
          .get(ev.id) as
          | {
              id: number;
              file_uuid: string;
              original_name: string;
              stored_filename: string;
              relative_storage_path: string;
              file_category: string;
              file_size_bytes: number;
              visibility: 'PRIVATE' | 'PUBLIC';
              attached_message: string | null;
              recipient_raw_text: string | null;
            }
          | undefined;

        if (fileRow && fileRow.attached_message === null && fileRow.recipient_raw_text === null) {
          uncaptionedFilesToUpdate.push(fileRow);
        } else {
          break;
        }
      } else {
        break;
      }
    }

    if (uncaptionedFilesToUpdate.length > 0) {
      for (const targetFile of uncaptionedFilesToUpdate) {
        let newRelativePath = targetFile.relative_storage_path;

        if (
          previewResolution.visibility === 'PRIVATE' &&
          previewResolution.recipients.length > 0 &&
          targetFile.visibility === 'PUBLIC'
        ) {
          const currentAbsPath = resolveSafeStoragePath(
            appConfig.paths.storage,
            targetFile.relative_storage_path
          );
          const primaryUserFolder = sanitizeUserFolderId(previewResolution.recipients[0].userId);
          const userPrivateDir = resolveSafeStoragePath(
            appConfig.paths.privateStorage,
            primaryUserFolder
          );
          if (!fs.existsSync(userPrivateDir)) {
            fs.mkdirSync(userPrivateDir, { recursive: true });
          }
          const newAbsPath = resolveSafeStoragePath(userPrivateDir, targetFile.stored_filename);
          if (fs.existsSync(currentAbsPath) && currentAbsPath !== newAbsPath) {
            fs.renameSync(currentAbsPath, newAbsPath);
          }
          newRelativePath = path.posix.join('private', primaryUserFolder, targetFile.stored_filename);
        }

        runInTransaction(db, () => {
          db.prepare(
            `UPDATE files
             SET attached_message = ?,
                 recipient_raw_text = ?,
                 visibility = ?,
                 relative_storage_path = ?
             WHERE id = ?`
          ).run(
            previewResolution.attachedMessage,
            previewResolution.rawText,
            previewResolution.visibility,
            newRelativePath,
            targetFile.id
          );

          if (previewResolution.visibility === 'PRIVATE') {
            db.prepare(`DELETE FROM file_recipients WHERE file_pk = ?`).run(targetFile.id);
            const insertRec = db.prepare(
              `INSERT INTO file_recipients (file_pk, user_pk, recipient_user_id, assigned_at)
               VALUES (?, ?, ?, datetime('now'))`
            );
            for (const rec of previewResolution.recipients) {
              insertRec.run(targetFile.id, rec.userPk, rec.userId);
            }

            createNotificationsForIncomingItem(db, {
              itemType: 'FILE',
              filePk: targetFile.id,
              itemUuid: targetFile.file_uuid,
              title: targetFile.original_name,
              detailMessage: previewResolution.attachedMessage,
              fileType: targetFile.file_category,
              fileSizeBytes: targetFile.file_size_bytes,
              visibility: 'PRIVATE',
              recipients: previewResolution.recipients,
              receivedAt: receivedAtIso,
              eventBatchHint: message.id,
            });
          } else {
            db.prepare(`UPDATE notifications SET detail_message = ? WHERE file_pk = ?`).run(
              previewResolution.attachedMessage,
              targetFile.id
            );
          }
        });

        broadcastRealtimeEvent({
          type: 'FILE_UPDATED',
          itemUuid: targetFile.file_uuid,
          title: targetFile.original_name,
          fileCategory: targetFile.file_category,
          visibility: previewResolution.visibility,
          recipientUserIds: previewResolution.recipients.map((r) => r.userId),
          attachedMessage: previewResolution.attachedMessage,
          fileSizeBytes: targetFile.file_size_bytes,
          timestamp: receivedAtIso,
        });
      }

      updateWebhookStatus(eventPk, 'DATABASE_COMMITTED');

      const updatedNames = uncaptionedFilesToUpdate.map((f) => f.original_name).join(', ');
      const postAttachReply = [
        `✅ แนบข้อความและอัปเดตผู้รับให้ไฟล์ล่าสุดเรียบร้อยแล้ว`,
        `• ไฟล์: ${updatedNames}`,
        `• ผู้รับไฟล์: ${previewResolution.statusNote}`,
        `• ข้อความที่ฝาก (Comment): ${previewResolution.attachedMessage || '- (ไม่มีข้อความฝาก)'}`,
      ].join('\n');

      const replyRes = await sendLineReply(event.replyToken, postAttachReply);
      updateWebhookStatus(eventPk, 'SUCCESS', null, replyRes.status);
      return;
    }
  }

  // Otherwise, store as pending caption/recipient for the next file(s) from this sender (e.g. typing "Opor" then sending a PDF)
  if (senderId && text) {
    const existing = pendingSenderCaptions.get(senderId);
    const now = Date.now();
    // If the sender sent two text messages in a row before sending the file (e.g. "Opor" then "ตั๋วเครื่องบิน"), combine them!
    if (existing && existing.usedCount === 0 && now - existing.createdAtMs < 180 * 1000) {
      const combinedText = existing.text.includes('/')
        ? `${existing.text} ${text}`
        : `${existing.text} / ${text}`;
      pendingSenderCaptions.set(senderId, {
        text: combinedText,
        messageId: message.id,
        createdAtMs: now,
        lastUsedAtMs: 0,
        usedCount: 0,
      });
    } else {
      pendingSenderCaptions.set(senderId, {
        text,
        messageId: message.id,
        createdAtMs: now,
        lastUsedAtMs: 0,
        usedCount: 0,
      });
    }
  }

  const effectivePendingText =
    (senderId && pendingSenderCaptions.get(senderId)?.text) || text;
  const effectiveResolution = resolveRecipientsFromMessage(db, effectivePendingText);

  const infoReply =
    effectiveResolution.visibility === 'PRIVATE'
      ? [
          `📌 ตั้งค่าผู้รับสำหรับไฟล์ถัดไปเรียบร้อยแล้ว`,
          `• ผู้รับไฟล์: ${effectiveResolution.statusNote}`,
          `• ข้อความที่ฝาก (Comment): ${effectiveResolution.attachedMessage || '- (ไม่มีข้อความฝาก)'}`,
          `• กรุณาส่งไฟล์ตามมาภายใน 3 นาที`,
        ].join('\n')
      : [
          `ℹ️ ตั้งค่าไฟล์ถัดไปเป็น Public (ส่วนกลาง)`,
          `• ผู้รับไฟล์: ${effectiveResolution.statusNote}`,
          `• ข้อความที่ฝาก (Comment): ${effectiveResolution.attachedMessage || '- (ไม่มีข้อความฝาก)'}`,
          `• เคล็ดลับ: พิมพ์ "ชื่อผู้รับ / ข้อความฝาก" (เช่น Opor / ตั๋วเครื่องบิน) เพื่อส่งแบบ Private พร้อม Comment`,
        ].join('\n');

  const replyRes = await sendLineReply(event.replyToken, infoReply);
  updateWebhookStatus(eventPk, 'SUCCESS', null, replyRes.status);
}

