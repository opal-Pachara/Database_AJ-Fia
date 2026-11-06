import { Router, Request, Response } from 'express';
import { verifyLineSignature } from '../services/lineApi.js';
import {
  LineWebhookPayload,
  processLineWebhookPayload,
} from '../services/webhookProcessor.js';
import { writeSystemLog } from '../utils/logger.js';

export const lineWebhookRouter = Router();

/**
 * POST /api/line/webhook
 * Section 7:
 * 1. ตรวจสอบ X-Line-Signature ด้วย Channel Secret และ Raw Request Body
 * 2. ป้องกัน Webhook ปลอม
 * 3. ประมวลผล Event แบบ Idempotent และจัดการสถานะทุกขั้นตอน
 */
lineWebhookRouter.post('/webhook', async (req: Request, res: Response) => {
  const signature = req.headers['x-line-signature'] as string | undefined;
  const rawBody = req.rawBody;

  if (!rawBody || !verifyLineSignature(rawBody, signature)) {
    writeSystemLog({
      level: 'SECURITY',
      category: 'WEBHOOK',
      action: 'INVALID_LINE_SIGNATURE_REJECTED',
      ipAddress: req.ip,
      details: {
        hasSignature: Boolean(signature),
        hasRawBody: Boolean(rawBody),
      },
    });
    res.status(401).json({ error: 'Invalid X-Line-Signature' });
    return;
  }

  let payload: LineWebhookPayload;
  try {
    payload = JSON.parse(rawBody.toString('utf8')) as LineWebhookPayload;
  } catch {
    res.status(400).json({ error: 'Malformed JSON body' });
    return;
  }

  try {
    await processLineWebhookPayload(payload);
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    writeSystemLog({
      level: 'ERROR',
      category: 'WEBHOOK',
      action: 'WEBHOOK_UNHANDLED_EXCEPTION',
      ipAddress: req.ip,
      details: { error: errMsg },
    });
    res.status(500).json({ error: 'Webhook processing error' });
  }
});

