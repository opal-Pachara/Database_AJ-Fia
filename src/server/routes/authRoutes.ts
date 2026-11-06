import crypto from 'node:crypto';
import { Router, Request, Response } from 'express';
import { getDb } from '../db/connection.js';
import { appConfig } from '../config.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import {
  requireAuth,
  SESSION_COOKIE_NAME,
  signSessionToken,
} from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { writeSystemLog } from '../utils/logger.js';

export const authRouter = Router();

const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 30,
  keyPrefix: 'login_ip',
  message: 'มีการพยายามเข้าสู่ระบบมากเกินไป กรุณารอ 15 นาทีแล้วลองใหม่',
});

/**
 * POST /api/auth/login
 * REQ-06: ระบบ Login ด้วย User ID และ Password + ป้องกันการเดา Password + จำกัดจำนวนครั้งที่ Login ผิด
 */
authRouter.post('/login', loginRateLimiter, async (req: Request, res: Response) => {
  try {
    const userId = String(req.body?.userId || '').trim();
    const password = String(req.body?.password || '');

    if (!userId || !password) {
      res.status(400).json({ error: 'กรุณากรอก User ID และ Password ให้ครบถ้วน' });
      return;
    }

    const db = getDb();
    const userRow = db
      .prepare(
        `SELECT id, user_id, full_name, password_hash, role, status,
                must_change_password, failed_login_attempts, locked_until
         FROM users
         WHERE user_id = ?`
      )
      .get(userId) as
      | {
          id: number;
          user_id: string;
          full_name: string;
          password_hash: string;
          role: 'USER' | 'ADMIN';
          status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
          must_change_password: number;
          failed_login_attempts: number;
          locked_until: string | null;
        }
      | undefined;

    if (!userRow) {
      writeSystemLog({
        level: 'SECURITY',
        category: 'AUTH',
        action: 'LOGIN_FAILED_UNKNOWN_USER',
        actorUserId: userId,
        ipAddress: req.ip,
      });
      res.status(401).json({ error: 'User ID หรือ Password ไม่ถูกต้อง' });
      return;
    }

    // 1. Check account lockout (REQ-06: จำกัดจำนวนครั้งในการ Login ผิด)
    if (userRow.locked_until) {
      const lockExpiresMs = new Date(userRow.locked_until).getTime();
      if (lockExpiresMs > Date.now()) {
        const remainingMinutes = Math.ceil((lockExpiresMs - Date.now()) / 60000);
        writeSystemLog({
          level: 'SECURITY',
          category: 'AUTH',
          action: 'LOGIN_BLOCKED_ACCOUNT_LOCKED',
          actorUserId: userRow.user_id,
          ipAddress: req.ip,
          details: { lockedUntil: userRow.locked_until },
        });
        res.status(423).json({
          error: `บัญชีถูกระงับชั่วคราวเนื่องจากกรอกรหัสผ่านผิดเกินกำหนด กรุณารออีก ${remainingMinutes} นาที`,
        });
        return;
      }
    }

    // 2. Verify password using Argon2id
    const isPasswordValid = await verifyPassword(password, userRow.password_hash);
    if (!isPasswordValid) {
      const newAttempts = userRow.failed_login_attempts + 1;
      const maxAttempts = appConfig.security.maxLoginAttempts;
      let lockedUntilIso: string | null = null;

      if (newAttempts >= maxAttempts) {
        lockedUntilIso = new Date(
          Date.now() + appConfig.security.loginLockoutMinutes * 60 * 1000
        ).toISOString();
      }

      db.prepare(
        `UPDATE users
         SET failed_login_attempts = ?,
             locked_until = ?,
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(newAttempts, lockedUntilIso, userRow.id);

      writeSystemLog({
        level: 'SECURITY',
        category: 'AUTH',
        action: lockedUntilIso ? 'ACCOUNT_LOCKED_TOO_MANY_FAILURES' : 'LOGIN_FAILED_WRONG_PASSWORD',
        actorUserId: userRow.user_id,
        ipAddress: req.ip,
        details: { attempts: newAttempts, maxAttempts, lockedUntil: lockedUntilIso },
      });

      if (lockedUntilIso) {
        res.status(423).json({
          error: `กรอกรหัสผ่านผิดครบ ${maxAttempts} ครั้ง บัญชีถูกล็อกชั่วคราวเป็นเวลา ${appConfig.security.loginLockoutMinutes} นาที`,
        });
        return;
      }

      res.status(401).json({ error: 'User ID หรือ Password ไม่ถูกต้อง' });
      return;
    }

    // 3. Check account status AFTER password check (REQ-06: User ที่ถูกระงับบัญชีต้องไม่สามารถ Login ได้)
    if (userRow.status !== 'ACTIVE') {
      writeSystemLog({
        level: 'SECURITY',
        category: 'AUTH',
        action: 'LOGIN_BLOCKED_INACTIVE_OR_SUSPENDED',
        actorUserId: userRow.user_id,
        ipAddress: req.ip,
        details: { status: userRow.status },
      });
      res.status(403).json({
        error:
          userRow.status === 'SUSPENDED'
            ? 'บัญชีของคุณถูกระงับการใช้งาน (Suspended) กรุณาติดต่ออาจารย์ผู้ดูแลระบบ'
            : 'บัญชีของคุณถูกปิดใช้งาน (Inactive) กรุณาติดต่ออาจารย์ผู้ดูแลระบบ',
      });
      return;
    }

    // 4. Reset failed login attempts & create a secure session
    db.prepare(
      `UPDATE users
       SET failed_login_attempts = 0,
           locked_until = NULL,
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(userRow.id);

    // Opportunistically clean up expired sessions
    db.prepare(`DELETE FROM sessions WHERE expires_at <= datetime('now')`).run();

    const sessionId = crypto.randomBytes(32).toString('hex');
    const csrfToken = crypto.randomBytes(24).toString('hex');
    const ttlMs = appConfig.security.sessionTtlHours * 3600 * 1000;
    const expiresAtIso = new Date(Date.now() + ttlMs).toISOString();

    db.prepare(
      `INSERT INTO sessions (
        session_id, user_pk, csrf_token, ip_address, user_agent, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(
      sessionId,
      userRow.id,
      csrfToken,
      req.ip || null,
      String(req.headers['user-agent'] || '').slice(0, 255),
      expiresAtIso
    );

    const signedCookie = signSessionToken(sessionId);
    const isSecureRequest =
      req.secure || req.headers['x-forwarded-proto'] === 'https';

    res.cookie(SESSION_COOKIE_NAME, signedCookie, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isSecureRequest,
      maxAge: ttlMs,
      path: '/',
    });

    writeSystemLog({
      level: 'INFO',
      category: 'AUTH',
      action: 'LOGIN_SUCCESS',
      actorUserId: userRow.user_id,
      ipAddress: req.ip,
      details: { role: userRow.role, mustChangePassword: userRow.must_change_password === 1 },
    });

    res.json({
      user: {
        id: userRow.id,
        userId: userRow.user_id,
        fullName: userRow.full_name,
        role: userRow.role,
        status: userRow.status,
        mustChangePassword: userRow.must_change_password === 1,
      },
      csrfToken,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบขณะเข้าสู่ระบบ' });
  }
});

/**
 * POST /api/auth/logout
 * REQ-06: มีระบบ Logout
 */
authRouter.post(
  '/logout',
  requireAuth({ allowPasswordChangePending: true }),
  (req: Request, res: Response) => {
    const db = getDb();
    if (req.authUser) {
      db.prepare('DELETE FROM sessions WHERE session_id = ?').run(req.authUser.sessionId);
      writeSystemLog({
        level: 'INFO',
        category: 'AUTH',
        action: 'LOGOUT_SUCCESS',
        actorUserId: req.authUser.userId,
        ipAddress: req.ip,
      });
    }
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
  }
);

/**
 * GET /api/auth/me
 */
authRouter.get(
  '/me',
  requireAuth({ allowPasswordChangePending: true }),
  (req: Request, res: Response) => {
    const u = req.authUser!;
    res.json({
      user: {
        id: u.id,
        userId: u.userId,
        fullName: u.fullName,
        role: u.role,
        status: u.status,
        mustChangePassword: u.mustChangePassword,
      },
      csrfToken: u.csrfToken,
    });
  }
);

/**
 * POST /api/auth/change-password
 * REQ-06: ผู้ใช้งานสามารถเปลี่ยน Password ได้ด้วยตนเองหลังจาก Login / บังคับเปลี่ยน Password เมื่อ Login ครั้งแรก
 */
authRouter.post(
  '/change-password',
  requireAuth({ allowPasswordChangePending: true }),
  async (req: Request, res: Response) => {
    try {
      const u = req.authUser!;
      const currentPassword = String(req.body?.currentPassword || '');
      const newPassword = String(req.body?.newPassword || '');

      if (!currentPassword || !newPassword) {
        res.status(400).json({ error: 'กรุณากรอกรหัสผ่านปัจจุบันและรหัสผ่านใหม่ให้ครบถ้วน' });
        return;
      }

      if (newPassword.length < 6) {
        res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร' });
        return;
      }

      if (newPassword === u.userId) {
        res.status(400).json({
          error: 'รหัสผ่านใหม่ต้องไม่ซ้ำกับ User ID ของคุณ (เพื่อความปลอดภัยตามข้อกำหนด)',
        });
        return;
      }

      if (newPassword === currentPassword) {
        res.status(400).json({
          error: 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม',
        });
        return;
      }

      const db = getDb();
      const userRow = db
        .prepare('SELECT password_hash FROM users WHERE id = ?')
        .get(u.id) as { password_hash: string } | undefined;

      if (!userRow) {
        res.status(404).json({ error: 'ไม่พบบัญชีผู้ใช้งาน' });
        return;
      }

      const validCurrent = await verifyPassword(currentPassword, userRow.password_hash);
      if (!validCurrent) {
        writeSystemLog({
          level: 'SECURITY',
          category: 'AUTH',
          action: 'PASSWORD_CHANGE_FAILED_WRONG_CURRENT',
          actorUserId: u.userId,
          ipAddress: req.ip,
        });
        res.status(400).json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
        return;
      }

      const newHash = await hashPassword(newPassword);
      db.prepare(
        `UPDATE users
         SET password_hash = ?,
             must_change_password = 0,
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(newHash, u.id);

      // Invalidate any other sessions for this user except the current session
      db.prepare('DELETE FROM sessions WHERE user_pk = ? AND session_id != ?').run(
        u.id,
        u.sessionId
      );

      writeSystemLog({
        level: 'INFO',
        category: 'AUTH',
        action: 'PASSWORD_CHANGED_SUCCESS',
        actorUserId: u.userId,
        ipAddress: req.ip,
      });

      res.json({
        ok: true,
        message: 'เปลี่ยนรหัสผ่านสำเร็จเรียบร้อยแล้ว',
      });
    } catch (err) {
      console.error('Change password error:', err);
      res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน' });
    }
  }
);

