import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/connection.js';
import { appConfig } from '../config.js';
import { writeSystemLog } from '../utils/logger.js';

export interface AuthenticatedUser {
  id: number;
  userId: string;
  fullName: string;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  mustChangePassword: boolean;
  sessionId: string;
  csrfToken: string;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
      rawBody?: Buffer;
    }
  }
}

export const SESSION_COOKIE_NAME = 'line_oa_sid';

export function signSessionToken(sessionId: string): string {
  const hmac = crypto
    .createHmac('sha256', appConfig.security.sessionSecret)
    .update(sessionId)
    .digest('base64url');
  return `${sessionId}.${hmac}`;
}

export function verifySignedSessionToken(signedValue?: string): string | null {
  if (!signedValue || typeof signedValue !== 'string') {
    return null;
  }
  const dotIdx = signedValue.indexOf('.');
  if (dotIdx <= 0) {
    return null;
  }
  const sessionId = signedValue.slice(0, dotIdx);
  const providedSig = signedValue.slice(dotIdx + 1);
  const expectedToken = signSessionToken(sessionId);
  const expectedSig = expectedToken.slice(dotIdx + 1);

  const bufA = Buffer.from(providedSig);
  const bufB = Buffer.from(expectedSig);
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return null;
  }
  return sessionId;
}

/**
 * Middleware that authenticates the user from the signed HttpOnly session cookie,
 * verifies the account is still ACTIVE, and checks CSRF token for state-mutating methods.
 */
export function requireAuth(options?: { allowPasswordChangePending?: boolean }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const rawCookie = req.cookies?.[SESSION_COOKIE_NAME];
    const sessionId = verifySignedSessionToken(rawCookie);

    if (!sessionId) {
      res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน (Unauthorized)' });
      return;
    }

    const db = getDb();
    const row = db
      .prepare(
        `SELECT
          s.session_id,
          s.csrf_token,
          s.expires_at,
          u.id AS user_pk,
          u.user_id,
          u.full_name,
          u.role,
          u.status,
          u.must_change_password
        FROM sessions s
        JOIN users u ON u.id = s.user_pk
        WHERE s.session_id = ?`
      )
      .get(sessionId) as
      | {
          session_id: string;
          csrf_token: string;
          expires_at: string;
          user_pk: number;
          user_id: string;
          full_name: string;
          role: 'USER' | 'ADMIN';
          status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
          must_change_password: number;
        }
      | undefined;

    if (!row) {
      res.clearCookie(SESSION_COOKIE_NAME);
      res.status(401).json({ error: 'เซสชันไม่ถูกต้องหรือหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
      return;
    }

    // Check expiration
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      db.prepare('DELETE FROM sessions WHERE session_id = ?').run(sessionId);
      res.clearCookie(SESSION_COOKIE_NAME);
      res.status(401).json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
      return;
    }

    // REQ-06: User ที่ถูกระงับบัญชีต้องไม่สามารถใช้งานได้
    if (row.status !== 'ACTIVE') {
      db.prepare('DELETE FROM sessions WHERE user_pk = ?').run(row.user_pk);
      res.clearCookie(SESSION_COOKIE_NAME);
      writeSystemLog({
        level: 'SECURITY',
        category: 'AUTH',
        action: 'SUSPENDED_USER_SESSION_BLOCKED',
        actorUserId: row.user_id,
        ipAddress: req.ip,
        details: { status: row.status },
      });
      res.status(403).json({
        error: 'บัญชีของคุณถูกระงับหรือปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ',
      });
      return;
    }

    // CSRF verification for state-changing requests
    const method = req.method.toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      const csrfHeader = req.headers['x-csrf-token'];
      if (!csrfHeader || csrfHeader !== row.csrf_token) {
        writeSystemLog({
          level: 'SECURITY',
          category: 'AUTH',
          action: 'CSRF_TOKEN_MISMATCH',
          actorUserId: row.user_id,
          ipAddress: req.ip,
          details: { path: req.originalUrl, method },
        });
        res.status(403).json({ error: 'CSRF Token ไม่ถูกต้อง กรุณารีเฟรชหน้าเว็บแล้วลองใหม่' });
        return;
      }
    }

    const mustChangePassword = row.must_change_password === 1;

    // REQ-06: บังคับเปลี่ยน Password เมื่อ Login ครั้งแรก
    if (mustChangePassword && !options?.allowPasswordChangePending) {
      res.status(403).json({
        error: 'ต้องเปลี่ยนรหัสผ่านเริ่มต้นก่อนเข้าใช้งานระบบ',
        code: 'MUST_CHANGE_PASSWORD',
      });
      return;
    }

    req.authUser = {
      id: row.user_pk,
      userId: row.user_id,
      fullName: row.full_name,
      role: row.role,
      status: row.status,
      mustChangePassword,
      sessionId: row.session_id,
      csrfToken: row.csrf_token,
    };

    next();
  };
}

/**
 * Middleware that enforces ADMIN role authorization.
 * Section 8: Admin Authorization
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.authUser || req.authUser.role !== 'ADMIN') {
    writeSystemLog({
      level: 'SECURITY',
      category: 'AUTH',
      action: 'UNAUTHORIZED_ADMIN_ACCESS_ATTEMPT',
      actorUserId: req.authUser?.userId || null,
      ipAddress: req.ip,
      details: { path: req.originalUrl },
    });
    res.status(403).json({ error: 'สำหรับผู้ดูแลระบบ (Admin) เท่านั้น' });
    return;
  }
  next();
}

