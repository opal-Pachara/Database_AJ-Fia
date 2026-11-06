import crypto from 'node:crypto';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { appConfig } from '../config.js';
import { getDiskSpaceInfo } from '../utils/disk.js';
import { writeSystemLog } from '../utils/logger.js';

/**
 * Validates the X-Line-Signature header using HMAC-SHA256 and timing-safe comparison.
 * Section 7 (1): ตรวจสอบ X-Line-Signature ด้วย Channel Secret และ Raw Request Body
 */
export function verifyLineSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  channelSecret: string = appConfig.line.channelSecret
): boolean {
  if (!signatureHeader || !channelSecret || !rawBody) {
    return false;
  }
  const expectedBase64 = crypto
    .createHmac('sha256', channelSecret)
    .update(rawBody)
    .digest('base64');

  const bufProvided = Buffer.from(signatureHeader, 'utf8');
  const bufExpected = Buffer.from(expectedBase64, 'utf8');
  if (bufProvided.length !== bufExpected.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufProvided, bufExpected);
}

export interface DownloadedContentResult {
  sizeBytes: number;
  mimeType: string;
  sha256Checksum: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Streams binary file content from the LINE Content API directly to a temporary file on disk,
 * enforcing file size limits, verifying disk space, and computing SHA-256 checksum on the fly.
 *
 * REQ-09 & Section 7 (7, 8, 9, 10, 12)
 */
export async function downloadLineContentToTemp(params: {
  messageId: string;
  tempFilePath: string;
  declaredFileSize?: number;
}): Promise<DownloadedContentResult> {
  const { messageId, tempFilePath, declaredFileSize } = params;
  const maxFileSize = appConfig.limits.maxFileSizeBytes;
  const minFreeDisk = appConfig.limits.minFreeDiskBytes;

  // 1. Pre-check declared fileSize from webhook event if available
  if (typeof declaredFileSize === 'number' && declaredFileSize > maxFileSize) {
    throw new Error(
      `FILE_TOO_LARGE: ขนาดไฟล์ (${formatBytes(declaredFileSize)}) เกินขีดจำกัดที่รองรับ (${formatBytes(maxFileSize)})`
    );
  }

  // 2. Pre-check available disk space before starting network download
  const initialDisk = getDiskSpaceInfo(appConfig.storageRootPath);
  const estimatedNeeded = (declaredFileSize || 0) + minFreeDisk;
  if (initialDisk.freeBytes < estimatedNeeded) {
    throw new Error(
      `DISK_FULL: พื้นที่ว่างในเครื่อง Server ไม่เพียงพอ (ว่าง ${formatBytes(initialDisk.freeBytes)})`
    );
  }

  if (!appConfig.line.channelAccessToken) {
    throw new Error('LINE_CONFIG_MISSING: ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN ในไฟล์ .env');
  }

  const contentUrl = `${appConfig.line.dataApiBaseUrl}/v2/bot/message/${encodeURIComponent(messageId)}/content`;

  // Retry loop for HTTP 202 Accepted (LINE video/audio transcoding preparation)
  let response: Response | null = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    response = await fetch(contentUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${appConfig.line.channelAccessToken}`,
      },
    });

    if (response.status === 202 && attempt < 5) {
      await sleep(attempt * 1000);
      continue;
    }
    break;
  }

  if (!response || !response.ok) {
    const status = response ? response.status : 0;
    let errText = '';
    try {
      errText = response ? await response.text() : 'No response';
    } catch {
      errText = 'Unable to read response body';
    }
    throw new Error(`LINE_CONTENT_DOWNLOAD_FAILED: HTTP ${status} (${errText.slice(0, 200)})`);
  }

  const rawContentType = response.headers.get('content-type') || 'application/octet-stream';
  const mimeType = rawContentType.split(';')[0].trim().toLowerCase() || 'application/octet-stream';

  const contentLengthHeader = response.headers.get('content-length');
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : undefined;

  if (typeof contentLength === 'number' && !Number.isNaN(contentLength)) {
    if (contentLength > maxFileSize) {
      throw new Error(
        `FILE_TOO_LARGE: ขนาดไฟล์จาก LINE (${formatBytes(contentLength)}) เกินขีดจำกัด (${formatBytes(maxFileSize)})`
      );
    }
    const diskCheck = getDiskSpaceInfo(appConfig.storageRootPath);
    if (diskCheck.freeBytes < contentLength + minFreeDisk) {
      throw new Error(
        `DISK_FULL: พื้นที่ว่างบน Disk ไม่เพียงพอสำหรับจัดเก็บไฟล์ขนาด ${formatBytes(contentLength)}`
      );
    }
  }

  if (!response.body) {
    throw new Error('LINE_CONTENT_EMPTY_BODY: ไม่พบข้อมูลไฟล์จาก LINE Content API');
  }

  const hash = crypto.createHash('sha256');
  let receivedBytes = 0;

  const fileStream = fs.createWriteStream(tempFilePath, { flags: 'w' });
  const nodeReadable = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream);

  try {
    for await (const chunk of nodeReadable) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      receivedBytes += buf.length;

      if (receivedBytes > maxFileSize) {
        throw new Error(
          `FILE_TOO_LARGE: ขนาดไฟล์จริงเกินขีดจำกัดสูงสุด (${formatBytes(maxFileSize)})`
        );
      }

      hash.update(buf);
      const canContinue = fileStream.write(buf);
      if (!canContinue) {
        await new Promise<void>((resolve) => fileStream.once('drain', resolve));
      }
    }

    await new Promise<void>((resolve, reject) => {
      fileStream.end((err?: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  } catch (streamErr) {
    fileStream.destroy();
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    } catch {
      // Ignore cleanup error
    }
    throw streamErr;
  }

  return {
    sizeBytes: receivedBytes,
    mimeType,
    sha256Checksum: hash.digest('hex'),
  };
}

/**
 * Sends a Reply Message back to the sender via LINE Messaging API.
 * REQ-08: การตอบกลับผ่าน LINE OA (คำนึงถึงอายุของ Reply Token และข้อจำกัดของ API)
 */
export async function sendLineReply(
  replyToken: string | undefined,
  textMessage: string
): Promise<{ status: 'SENT' | 'EXPIRED' | 'FAILED' | 'NOT_APPLICABLE'; error?: string }> {
  if (!replyToken || replyToken === '00000000000000000000000000000000' || replyToken === 'ffffffffffffffffffffffffffffffff') {
    return { status: 'NOT_APPLICABLE' };
  }

  if (!appConfig.line.channelAccessToken) {
    writeSystemLog({
      level: 'WARN',
      category: 'WEBHOOK',
      action: 'REPLY_SKIPPED_NO_TOKEN',
      details: { reason: 'LINE_CHANNEL_ACCESS_TOKEN is not configured' },
    });
    return { status: 'FAILED', error: 'LINE_CHANNEL_ACCESS_TOKEN not configured' };
  }

  try {
    const replyUrl = `${appConfig.line.apiBaseUrl}/v2/bot/message/reply`;
    const response = await fetch(replyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${appConfig.line.channelAccessToken}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [
          {
            type: 'text',
            text: textMessage.slice(0, 4900),
          },
        ],
      }),
    });

    if (response.ok) {
      return { status: 'SENT' };
    }

    const errBody = await response.text().catch(() => '');
    const isExpired =
      response.status === 400 && errBody.toLowerCase().includes('invalid reply token');

    writeSystemLog({
      level: 'WARN',
      category: 'WEBHOOK',
      action: isExpired ? 'REPLY_TOKEN_EXPIRED_OR_INVALID' : 'REPLY_API_FAILED',
      details: { httpStatus: response.status, responseBody: errBody.slice(0, 300) },
    });

    return {
      status: isExpired ? 'EXPIRED' : 'FAILED',
      error: `HTTP ${response.status}: ${errBody.slice(0, 200)}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeSystemLog({
      level: 'ERROR',
      category: 'WEBHOOK',
      action: 'REPLY_NETWORK_ERROR',
      details: { error: msg },
    });
    return { status: 'FAILED', error: msg };
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(2)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

