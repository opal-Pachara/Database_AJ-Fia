import { Request, Response, NextFunction } from 'express';
import { writeSystemLog } from '../utils/logger.js';

interface RateBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateBucket>();

/**
 * Creates a memory-efficient rate limiting middleware for Windows self-hosted server.
 * Section 8: Rate Limiting
 */
export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
  message?: string;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const clientIp =
      (req.headers['cf-connecting-ip'] as string) ||
      req.ip ||
      req.socket.remoteAddress ||
      'unknown';
    const key = `${options.keyPrefix}:${clientIp}`;

    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    existing.count += 1;
    if (existing.count > options.maxRequests) {
      writeSystemLog({
        level: 'SECURITY',
        category: 'AUTH',
        action: 'RATE_LIMIT_EXCEEDED',
        ipAddress: clientIp,
        details: { keyPrefix: options.keyPrefix, count: existing.count },
      });
      res.status(429).json({
        error:
          options.message ||
          'มีการส่งคำขอมากเกินกำหนด กรุณารอสักครู่แล้วลองใหม่อีกครั้ง (Too Many Requests)',
      });
      return;
    }

    next();
  };
}

export function clearRateLimitBuckets(): void {
  buckets.clear();
}

