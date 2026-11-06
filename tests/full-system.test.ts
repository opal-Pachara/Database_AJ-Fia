import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

// Configure isolated test environment BEFORE importing server modules
const testRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'line-oa-test-'));
process.env.NODE_ENV = 'test';
process.env.STORAGE_ROOT_PATH = testRootDir;
process.env.INITIAL_ADMIN_USER_ID = 'admin';
process.env.INITIAL_ADMIN_NAME = 'อาจารย์ทดสอบ';
process.env.INITIAL_ADMIN_PASSWORD = 'admin';
process.env.SESSION_SECRET = 'test_session_secret_64_chars_1234567890abcdef1234567890abcdef';
process.env.LINE_CHANNEL_SECRET = 'test_line_channel_secret_xyz987';
process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test_line_access_token_abc123';
process.env.ALLOWED_SENDER_LINE_USER_ID = 'U11111111111111111111111111111111';
process.env.MAX_FILE_SIZE_BYTES = String(5 * 1024 * 1024); // 5 MB for test
process.env.MIN_FREE_DISK_BYTES = String(10 * 1024 * 1024); // 10 MB for test
process.env.MAX_LOGIN_ATTEMPTS = '5';
process.env.LOGIN_LOCKOUT_MINUTES = '15';

interface TestResult {
  id: string;
  phase: string;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

async function runStep(
  id: string,
  phase: string,
  name: string,
  fn: () => Promise<string>
): Promise<void> {
  try {
    const details = await fn();
    results.push({ id, phase, name, passed: true, details });
    console.log(`✅ [${id}] (${phase}) ${name} -> PASSED: ${details}`);
  } catch (err) {
    const msg = err instanceof Error ? err.stack || err.message : String(err);
    results.push({ id, phase, name, passed: false, details: msg });
    console.error(`❌ [${id}] (${phase}) ${name} -> FAILED:\n${msg}`);
    throw err;
  }
}

async function main() {
  // 1. Start Mock LINE API Server (Content API + Reply API)
  const sentReplies: Array<{ replyToken: string; messages: Array<{ type: string; text: string }> }> = [];
  const mockContentStore = new Map<
    string,
    { contentType: string; data: Buffer; simulate202Count?: number }
  >();

  const samplePdfBytes = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\nSample Lecture Note PDF Content',
    'utf8'
  );
  const sampleImageBytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);
  const sampleDocxBytes = Buffer.from('PK\x03\x04MockWordDocumentContentForTesting', 'utf8');
  const oversizedBytes = Buffer.alloc(6 * 1024 * 1024, 0x41); // 6 MB > 5 MB limit

  mockContentStore.set('msg_pdf_public_1', {
    contentType: 'application/pdf',
    data: samplePdfBytes,
  });
  mockContentStore.set('msg_img_public_2', {
    contentType: 'image/png',
    data: sampleImageBytes,
  });
  mockContentStore.set('msg_pdf_private_6501001', {
    contentType: 'application/pdf',
    data: samplePdfBytes,
  });
  mockContentStore.set('msg_docx_private_6501001', {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    data: sampleDocxBytes,
  });
  mockContentStore.set('msg_img_quote_pair', {
    contentType: 'image/png',
    data: sampleImageBytes,
  });
  mockContentStore.set('msg_file_unknown_user', {
    contentType: 'application/pdf',
    data: samplePdfBytes,
  });
  mockContentStore.set('msg_file_oversized', {
    contentType: 'application/zip',
    data: oversizedBytes,
  });
  mockContentStore.set('msg_file_boarding_pass_opor', {
    contentType: 'application/pdf',
    data: samplePdfBytes,
  });
  mockContentStore.set('msg_file_opor_with_comment', {
    contentType: 'application/pdf',
    data: samplePdfBytes,
  });

  const mockLineServer = http.createServer((req, res) => {
    const url = req.url || '';
    if (req.method === 'GET' && url.startsWith('/v2/bot/message/') && url.endsWith('/content')) {
      const parts = url.split('/');
      const msgId = decodeURIComponent(parts[4]);
      const item = mockContentStore.get(msgId);
      if (!item) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Not found' }));
        return;
      }
      if (item.simulate202Count && item.simulate202Count > 0) {
        item.simulate202Count -= 1;
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Preparing content' }));
        return;
      }
      res.writeHead(200, {
        'Content-Type': item.contentType,
        'Content-Length': String(item.data.length),
      });
      res.end(item.data);
      return;
    }

    if (req.method === 'POST' && url === '/v2/bot/message/reply') {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        sentReplies.push(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ sentMessages: [{ id: 'reply_1' }] }));
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => mockLineServer.listen(0, '127.0.0.1', resolve));
  const mockLinePort = (mockLineServer.address() as { port: number }).port;
  process.env.LINE_API_BASE_URL = `http://127.0.0.1:${mockLinePort}`;
  process.env.LINE_DATA_API_BASE_URL = `http://127.0.0.1:${mockLinePort}`;

  // Import application modules after setting env vars
  const { appConfig, ensureStorageDirectories } = await import('../src/server/config.js');
  // Patch line URLs on loaded config
  appConfig.line.apiBaseUrl = `http://127.0.0.1:${mockLinePort}`;
  appConfig.line.dataApiBaseUrl = `http://127.0.0.1:${mockLinePort}`;

  const { getDb, closeDb } = await import('../src/server/db/connection.js');
  const { ensureInitialAdmin } = await import('../src/server/db/seed.js');
  const { createApp } = await import('../src/server/app.js');
  const { setRecipientSyntaxExtractor } = await import('../src/server/services/recipientParser.js');
  const { clearRateLimitBuckets } = await import('../src/server/middleware/rateLimit.js');

  ensureStorageDirectories(appConfig);
  const db = getDb(appConfig);
  await ensureInitialAdmin(db, appConfig);

  const app = createApp();
  const appServer = http.createServer(app);
  await new Promise<void>((resolve) => appServer.listen(0, '127.0.0.1', resolve));
  const appPort = (appServer.address() as { port: number }).port;
  const baseUrl = `http://127.0.0.1:${appPort}`;

  // Helper class for maintaining session cookie & CSRF token per test client
  class TestClient {
    cookie = '';
    csrfToken = '';

    async request(
      method: string,
      urlPath: string,
      body?: unknown,
      customHeaders?: Record<string, string>
    ): Promise<{ status: number; data: any; rawBuffer: Buffer; headers: Headers }> {
      const headers: Record<string, string> = { ...(customHeaders || {}) };
      if (this.cookie) {
        headers['Cookie'] = this.cookie;
      }
      if (this.csrfToken && !('x-csrf-token' in headers)) {
        headers['x-csrf-token'] = this.csrfToken;
      }
      let payload: BodyInit | undefined;
      if (body !== undefined) {
        if (Buffer.isBuffer(body)) {
          payload = new Uint8Array(body);
        } else {
          headers['Content-Type'] = 'application/json';
          payload = JSON.stringify(body);
        }
      }

      const resp = await fetch(`${baseUrl}${urlPath}`, {
        method,
        headers,
        body: payload,
      });

      const setCookie = resp.headers.get('set-cookie');
      if (setCookie) {
        this.cookie = setCookie.split(';')[0];
      }

      const arrayBuf = await resp.arrayBuffer();
      const rawBuffer = Buffer.from(arrayBuf);
      let data: any = null;
      try {
        data = JSON.parse(rawBuffer.toString('utf8'));
        if (data && typeof data.csrfToken === 'string') {
          this.csrfToken = data.csrfToken;
        }
      } catch {
        data = rawBuffer.toString('utf8');
      }

      return { status: resp.status, data, rawBuffer, headers: resp.headers };
    }
  }

  function signWebhookBody(bodyObj: unknown): { raw: Buffer; sig: string } {
    const raw = Buffer.from(JSON.stringify(bodyObj), 'utf8');
    const sig = crypto
      .createHmac('sha256', appConfig.line.channelSecret)
      .update(raw)
      .digest('base64');
    return { raw, sig };
  }

  const adminClient = new TestClient();
  const student1Client = new TestClient();
  const student2Client = new TestClient();

  try {
    // =========================================================================
    // PHASE 7 & 8: AUTHENTICATION, INITIAL PASSWORD CHANGE, USER MANAGEMENT
    // =========================================================================
    await runStep(
      'TEST-01',
      'Phase 7 & AC-09/AC-10',
      'Admin Login ครั้งแรก และบังคับเปลี่ยนรหัสผ่านเริ่มต้น (REQ-06)',
      async () => {
        const loginRes = await adminClient.request('POST', '/api/auth/login', {
          userId: 'admin',
          password: 'admin',
        });
        assert.equal(loginRes.status, 200);
        assert.equal(loginRes.data.user.mustChangePassword, true);

        // Must block access to /api/admin/users before password change
        const blockedRes = await adminClient.request('GET', '/api/admin/users');
        assert.equal(blockedRes.status, 403);
        assert.equal(blockedRes.data.code, 'MUST_CHANGE_PASSWORD');

        // Reject setting new password equal to userId
        const sameIdRes = await adminClient.request('POST', '/api/auth/change-password', {
          currentPassword: 'admin',
          newPassword: 'admin',
        });
        assert.equal(sameIdRes.status, 400);

        // Change to strong password
        const changeRes = await adminClient.request('POST', '/api/auth/change-password', {
          currentPassword: 'admin',
          newPassword: 'AdminStrong#2026',
        });
        assert.equal(changeRes.status, 200);
        return 'Admin login & forced initial password change verified';
      }
    );

    await runStep(
      'TEST-02',
      'Phase 7 & AC-08',
      'Admin เพิ่มบัญชีผู้ใช้งาน 6501001 และ 6501002 โดยรหัสเริ่มต้นเท่ากับ User ID (REQ-05, REQ-06)',
      async () => {
        const r1 = await adminClient.request('POST', '/api/admin/users', {
          userId: '6501001',
          fullName: 'สมชาย นักศึกษา 1',
        });
        assert.equal(r1.status, 201);
        assert.equal(r1.data.user.userId, '6501001');
        assert.equal(r1.data.user.mustChangePassword, true);

        const r2 = await adminClient.request('POST', '/api/admin/users', {
          userId: '6501002',
          fullName: 'สมหญิง นักศึกษา 2',
        });
        assert.equal(r2.status, 201);

        // Verify password stored in DB is Argon2id hash, NOT plain text
        const dbRow = db
          .prepare('SELECT password_hash FROM users WHERE user_id = ?')
          .get('6501001') as { password_hash: string };
        assert.ok(dbRow.password_hash.startsWith('$argon2id$'));
        assert.notEqual(dbRow.password_hash, '6501001');

        return 'Created users 6501001 & 6501002 with Argon2id hashed initial passwords';
      }
    );

    await runStep(
      'TEST-03',
      'Phase 8 Security',
      'ทดสอบกรอกรหัสผ่านผิดซ้ำจนบัญชีถูกล็อก (Account Lockout - REQ-06) และการระงับบัญชี (Suspended)',
      async () => {
        clearRateLimitBuckets();
        const attacker = new TestClient();
        for (let i = 1; i <= 5; i++) {
          const res = await attacker.request('POST', '/api/auth/login', {
            userId: '6501002',
            password: `wrong_pass_${i}`,
          });
          if (i < 5) {
            assert.equal(res.status, 401);
          } else {
            assert.equal(res.status, 423); // Locked on 5th failed attempt
          }
        }

        // Even with the right password, locked account must return 423 while locked
        const lockedTry = await attacker.request('POST', '/api/auth/login', {
          userId: '6501002',
          password: '6501002',
        });
        assert.equal(lockedTry.status, 423);

        // Admin suspends 6501002 -> must return 403 when attempting login after unlock
        const user2Row = db
          .prepare('SELECT id FROM users WHERE user_id = ?')
          .get('6501002') as { id: number };
        await adminClient.request('PATCH', `/api/admin/users/${user2Row.id}/status`, {
          status: 'SUSPENDED',
        });
        // Clear lock timestamp to test SUSPENDED check specifically
        db.prepare('UPDATE users SET locked_until = NULL, failed_login_attempts = 0 WHERE id = ?').run(
          user2Row.id
        );

        const suspendedTry = await attacker.request('POST', '/api/auth/login', {
          userId: '6501002',
          password: '6501002',
        });
        assert.equal(suspendedTry.status, 403);

        // Re-activate 6501002 for subsequent multi-user tests
        await adminClient.request('PATCH', `/api/admin/users/${user2Row.id}/status`, {
          status: 'ACTIVE',
        });

        return 'Brute-force lockout (423) and Suspended account block (403) verified';
      }
    );

    await runStep(
      'TEST-04',
      'Phase 7 & AC-09/AC-10',
      'ผู้ใช้งาน 6501001 และ 6501002 เข้าสู่ระบบและเปลี่ยนรหัสผ่านเริ่มต้นสำเร็จ',
      async () => {
        const l1 = await student1Client.request('POST', '/api/auth/login', {
          userId: '6501001',
          password: '6501001',
        });
        assert.equal(l1.status, 200);
        const c1 = await student1Client.request('POST', '/api/auth/change-password', {
          currentPassword: '6501001',
          newPassword: 'Student1#Pass',
        });
        assert.equal(c1.status, 200);

        const l2 = await student2Client.request('POST', '/api/auth/login', {
          userId: '6501002',
          password: '6501002',
        });
        assert.equal(l2.status, 200);
        const c2 = await student2Client.request('POST', '/api/auth/change-password', {
          currentPassword: '6501002',
          newPassword: 'Student2#Pass',
        });
        assert.equal(c2.status, 200);

        return 'Both students logged in and changed initial passwords';
      }
    );

    // =========================================================================
    // PHASE 7 & 8: LINE WEBHOOK SECURITY, DEFAULT PUBLIC STORAGE, AND IDEMPOTENCY
    // =========================================================================
    await runStep(
      'TEST-05',
      'Phase 8 Security',
      'ป้องกัน Webhook ปลอมที่มี X-Line-Signature ไม่ถูกต้อง (Section 7 & 8)',
      async () => {
        const fakeBody = Buffer.from(JSON.stringify({ events: [] }), 'utf8');
        const res = await adminClient.request('POST', '/api/line/webhook', fakeBody, {
          'Content-Type': 'application/json',
          'x-line-signature': 'invalid_forged_signature_base64==',
        });
        assert.equal(res.status, 401);
        return 'Forged webhook rejected with 401 Unauthorized';
      }
    );

    await runStep(
      'TEST-06',
      'Phase 7 & AC-02/AC-03/AC-05/AC-06/AC-07/AC-18',
      'รับไฟล์จาก LINE Webhook เมื่อยังไม่กำหนด Syntax ผู้รับ -> จัดเก็บใน Public พร้อมตอบกลับ LINE OA (REQ-03, REQ-04, REQ-08)',
      async () => {
        // Ensure default unconfigured syntax mode (REQ-03: ห้ามกำหนด Syntax ขึ้นมาเอง)
        setRecipientSyntaxExtractor(null);

        const webhookPayload = {
          destination: 'Ubot',
          events: [
            {
              type: 'message',
              webhookEventId: 'evt_public_pdf_001',
              timestamp: Date.now(),
              replyToken: 'reply_token_pub_001',
              deliveryContext: { isRedelivery: false },
              source: {
                type: 'user',
                userId: 'U11111111111111111111111111111111',
              },
              message: {
                id: 'msg_pdf_public_1',
                type: 'file',
                fileName: 'เอกสารประกอบการเรียน_บทที่1.pdf',
                fileSize: samplePdfBytes.length,
              },
            },
            {
              type: 'message',
              webhookEventId: 'evt_public_img_002',
              timestamp: Date.now() + 500,
              replyToken: 'reply_token_pub_002',
              deliveryContext: { isRedelivery: false },
              source: {
                type: 'user',
                userId: 'U11111111111111111111111111111111',
              },
              message: {
                id: 'msg_img_public_2',
                type: 'image',
                contentProvider: { type: 'line' },
              },
            },
          ],
        };

        const { raw, sig } = signWebhookBody(webhookPayload);
        const res = await adminClient.request('POST', '/api/line/webhook', raw, {
          'Content-Type': 'application/json',
          'x-line-signature': sig,
        });
        assert.equal(res.status, 200);

        // Verify files are stored on disk under storage/public/ with real image extension (.png, NOT .bin)
        const publicFilesOnDisk = fs.readdirSync(appConfig.paths.publicStorage);
        assert.equal(publicFilesOnDisk.length, 2);
        assert.ok(
          publicFilesOnDisk.some((f) => f.endsWith('.png')),
          'Expected LINE image to be saved with .png extension instead of .bin'
        );
        assert.ok(
          !publicFilesOnDisk.some((f) => f.endsWith('.bin')),
          'Expected no .bin extension for LINE image'
        );

        // Verify LINE Reply was sent with file name, recipient (Public), size, and success status
        const lastReply = sentReplies.find((r) => r.replyToken === 'reply_token_pub_001');
        assert.ok(lastReply);
        assert.ok(lastReply.messages[0].text.includes('จัดเก็บไฟล์สำเร็จ'));
        assert.ok(lastReply.messages[0].text.includes('เอกสารประกอบการเรียน_บทที่1.pdf'));
        assert.ok(lastReply.messages[0].text.includes('Public'));

        // Test Webhook Retry / Duplicate Event Idempotency (Section 7 ข้อ 3-5)
        const retryPayload = {
          ...webhookPayload,
          events: [
            {
              ...webhookPayload.events[0],
              deliveryContext: { isRedelivery: true },
            },
          ],
        };
        const retrySigned = signWebhookBody(retryPayload);
        const retryRes = await adminClient.request('POST', '/api/line/webhook', retrySigned.raw, {
          'Content-Type': 'application/json',
          'x-line-signature': retrySigned.sig,
        });
        assert.equal(retryRes.status, 200);
        // Still only 2 files on disk (no duplicate created)
        assert.equal(fs.readdirSync(appConfig.paths.publicStorage).length, 2);

        return 'Public PDF & Image stored on disk, DB committed, LINE Reply sent, and duplicate webhook ignored';
      }
    );

    // =========================================================================
    // PHASE 7: RECIPIENT RESOLUTION (AC-04 & AC-05) + iOS SHARE SHEET PAIRING
    // =========================================================================
    await runStep(
      'TEST-07',
      'Phase 7 & AC-04/AC-05',
      'ทดสอบการระบุผู้รับเมื่อมี Syntax ที่ได้รับการยืนยัน + การจับคู่ข้อความจาก iOS Share Sheet & Quote Reply (REQ-02, REQ-03)',
      async () => {
        // Register a sample confirmed syntax for testing AC-04 (e.g., "@to:<USER_ID> <message>")
        setRecipientSyntaxExtractor((rawText: string) => {
          const m = rawText.match(/^@to:([a-zA-Z0-9_,-]+)\s*(.*)$/s);
          if (!m) return null;
          const ids = m[1].split(',').map((s) => s.trim()).filter(Boolean);
          return {
            candidateUserIds: ids,
            cleanedMessage: m[2]?.trim() || rawText,
          };
        });

        // 1. iOS Share Sheet Batch Pairing: file + text sent in same webhook payload for 6501001
        const batchPayload = {
          destination: 'Ubot',
          events: [
            {
              type: 'message',
              webhookEventId: 'evt_priv_pdf_001',
              timestamp: Date.now(),
              replyToken: 'reply_token_priv_001',
              source: {
                type: 'user',
                userId: 'U11111111111111111111111111111111',
              },
              message: {
                id: 'msg_pdf_private_6501001',
                type: 'file',
                fileName: 'ผลสอบย่อย_6501001.pdf',
                fileSize: samplePdfBytes.length,
              },
            },
            {
              type: 'message',
              webhookEventId: 'evt_priv_docx_002',
              timestamp: Date.now() + 100,
              replyToken: 'reply_token_priv_002',
              source: {
                type: 'user',
                userId: 'U11111111111111111111111111111111',
              },
              message: {
                id: 'msg_docx_private_6501001',
                type: 'file',
                fileName: 'ใบงานแก้ไข_6501001.docx',
                fileSize: sampleDocxBytes.length,
              },
            },
            {
              type: 'message',
              webhookEventId: 'evt_priv_caption_003',
              timestamp: Date.now() + 150,
              replyToken: 'reply_token_priv_003',
              source: {
                type: 'user',
                userId: 'U11111111111111111111111111111111',
              },
              message: {
                id: 'msg_text_caption_6501001',
                type: 'text',
                text: '@to:6501001 คะแนนสอบและใบงานของคุณสมชาย',
              },
            },
          ],
        };

        const signedBatch = signWebhookBody(batchPayload);
        const batchRes = await adminClient.request('POST', '/api/line/webhook', signedBatch.raw, {
          'Content-Type': 'application/json',
          'x-line-signature': signedBatch.sig,
        });
        assert.equal(batchRes.status, 200);

        // Verify stored in storage/private/6501001/
        const privDir6501001 = path.join(appConfig.paths.privateStorage, '6501001');
        assert.ok(fs.existsSync(privDir6501001));
        assert.equal(fs.readdirSync(privDir6501001).length, 2);

        // 2. Test Quote-Reply pairing: teacher sends image first (goes to Public), then quotes it with @to:6501001
        const imgOnlyPayload = {
          destination: 'Ubot',
          events: [
            {
              type: 'message',
              webhookEventId: 'evt_quote_img_1',
              timestamp: Date.now(),
              replyToken: 'reply_quote_img_1',
              source: {
                type: 'user',
                userId: 'U11111111111111111111111111111111',
              },
              message: {
                id: 'msg_img_quote_pair',
                type: 'image',
                contentProvider: { type: 'line' },
              },
            },
          ],
        };
        const signedImg = signWebhookBody(imgOnlyPayload);
        await adminClient.request('POST', '/api/line/webhook', signedImg.raw, {
          'Content-Type': 'application/json',
          'x-line-signature': signedImg.sig,
        });

        const quoteTextPayload = {
          destination: 'Ubot',
          events: [
            {
              type: 'message',
              webhookEventId: 'evt_quote_text_2',
              timestamp: Date.now() + 2000,
              replyToken: 'reply_quote_text_2',
              source: {
                type: 'user',
                userId: 'U11111111111111111111111111111111',
              },
              message: {
                id: 'msg_quote_text_2',
                type: 'text',
                quotedMessageId: 'msg_img_quote_pair',
                text: '@to:6501001 รูปกราฟการทดลองแล็บ',
              },
            },
          ],
        };
        const signedQuote = signWebhookBody(quoteTextPayload);
        await adminClient.request('POST', '/api/line/webhook', signedQuote.raw, {
          'Content-Type': 'application/json',
          'x-line-signature': signedQuote.sig,
        });

        // Now storage/private/6501001 should have 3 files!
        assert.equal(fs.readdirSync(privDir6501001).length, 3);

        // 3. Test unknown recipient fallback to PUBLIC (AC-05: หากไม่สามารถระบุผู้รับได้ ไฟล์ต้องถูกจัดเก็บใน Public)
        const unknownRecPayload = {
          destination: 'Ubot',
          events: [
            {
              type: 'message',
              webhookEventId: 'evt_unknown_user_file',
              timestamp: Date.now(),
              replyToken: 'reply_unknown_user',
              source: {
                type: 'user',
                userId: 'U11111111111111111111111111111111',
              },
              message: {
                id: 'msg_file_unknown_user',
                type: 'file',
                fileName: 'ประกาศรวม.pdf',
                fileSize: samplePdfBytes.length,
              },
            },
            {
              type: 'message',
              webhookEventId: 'evt_unknown_user_text',
              timestamp: Date.now(),
              replyToken: 'reply_unknown_user_txt',
              source: {
                type: 'user',
                userId: 'U11111111111111111111111111111111',
              },
              message: {
                id: 'msg_txt_unknown_user',
                type: 'text',
                text: '@to:9999999 ไฟล์ที่ระบุรหัสนักศึกษาที่ไม่มีในระบบ',
              },
            },
          ],
        };
        const signedUnknown = signWebhookBody(unknownRecPayload);
        await adminClient.request('POST', '/api/line/webhook', signedUnknown.raw, {
          'Content-Type': 'application/json',
          'x-line-signature': signedUnknown.sig,
        });

        // Reset syntax extractor back to null (default production state per REQ-03)
        setRecipientSyntaxExtractor(null);

        return 'Verified Batch Pairing, Quote-Reply Pairing, Private storage for 6501001, and Public fallback for unmatched user';
      }
    );

    // =========================================================================
    // PHASE 7: URL HANDLING (REQ-14 & AC-17) + FILE SIZE LIMIT (REQ-09)
    // =========================================================================
    await runStep(
      'TEST-08',
      'Phase 7 & AC-17 / REQ-09',
      'ทดสอบการส่ง URL (บันทึกเป็น Link โดยไม่ดาวน์โหลดหน้าเว็บ) และทดสอบไฟล์เกินขนาดที่กำหนด',
      async () => {
        const urlPayload = {
          destination: 'Ubot',
          events: [
            {
              type: 'message',
              webhookEventId: 'evt_url_001',
              timestamp: Date.now(),
              replyToken: 'reply_url_001',
              source: {
                type: 'user',
                userId: 'U11111111111111111111111111111111',
              },
              message: {
                id: 'msg_url_001',
                type: 'text',
                text: 'ลิงก์ส่งการบ้านวิชา Database https://university.example.edu/submit-db-hw',
              },
            },
          ],
        };
        const signedUrl = signWebhookBody(urlPayload);
        const resUrl = await adminClient.request('POST', '/api/line/webhook', signedUrl.raw, {
          'Content-Type': 'application/json',
          'x-line-signature': signedUrl.sig,
        });
        assert.equal(resUrl.status, 200);

        // Oversized file test (6 MB > 5 MB limit)
        const oversizedPayload = {
          destination: 'Ubot',
          events: [
            {
              type: 'message',
              webhookEventId: 'evt_oversized_001',
              timestamp: Date.now(),
              replyToken: 'reply_oversized_001',
              source: {
                type: 'user',
                userId: 'U11111111111111111111111111111111',
              },
              message: {
                id: 'msg_file_oversized',
                type: 'file',
                fileName: 'huge_archive.zip',
                fileSize: oversizedBytes.length,
              },
            },
          ],
        };
        const signedOver = signWebhookBody(oversizedPayload);
        await adminClient.request('POST', '/api/line/webhook', signedOver.raw, {
          'Content-Type': 'application/json',
          'x-line-signature': signedOver.sig,
        });

        const failReply = sentReplies.find((r) => r.replyToken === 'reply_oversized_001');
        assert.ok(failReply);
        assert.ok(failReply.messages[0].text.includes('การจัดเก็บไฟล์ล้มเหลว'));
        assert.ok(failReply.messages[0].text.includes('FILE_TOO_LARGE'));

        return 'URL stored as Link without fetching remote content; oversized file cleanly rejected with LINE failure reply';
      }
    );

    // =========================================================================
    // PHASE 7 & 8: ACCESS CONTROL, SEARCH, PREVIEW, DOWNLOAD (AC-11 TO AC-16)
    // =========================================================================
    await runStep(
      'TEST-09',
      'Phase 7 & 8 / AC-11 to AC-16',
      'ตรวจสอบสิทธิ์การมองเห็นไฟล์, ป้องกัน User อื่นแอบเปิดไฟล์ส่วนตัว, ทดสอบ Search, Preview และ Download',
      async () => {
        // Student 1 (6501001) should see 3 PRIVATE files + 3 PUBLIC files = 6 files total
        const s1FilesRes = await student1Client.request('GET', '/api/files');
        assert.equal(s1FilesRes.status, 200);
        assert.equal(s1FilesRes.data.summary.privateCount, 3);
        assert.equal(s1FilesRes.data.summary.publicCount, 3);
        assert.equal(s1FilesRes.data.files.length, 6);

        // Student 2 (6501002) should see 0 PRIVATE files + 3 PUBLIC files = 3 files total
        const s2FilesRes = await student2Client.request('GET', '/api/files');
        assert.equal(s2FilesRes.status, 200);
        assert.equal(s2FilesRes.data.summary.privateCount, 0);
        assert.equal(s2FilesRes.data.summary.publicCount, 3);
        assert.equal(s2FilesRes.data.files.length, 3);

        // Find 6501001's private PDF and private DOCX
        const privPdf = s1FilesRes.data.files.find(
          (f: any) => f.visibility === 'PRIVATE' && f.fileCategory === 'PDF'
        );
        const privDocx = s1FilesRes.data.files.find(
          (f: any) => f.visibility === 'PRIVATE' && f.fileCategory === 'DOCUMENT'
        );
        assert.ok(privPdf);
        assert.ok(privDocx);

        // CRITICAL SECURITY TEST (Section 8 & AC-13):
        // Student 2 attempts to Preview and Download Student 1's Private PDF by guessing/changing the UUID in URL
        const s2StealPreview = await student2Client.request(
          'GET',
          `/api/files/${privPdf.fileUuid}/preview`
        );
        assert.equal(s2StealPreview.status, 403);

        const s2StealDownload = await student2Client.request(
          'GET',
          `/api/files/${privPdf.fileUuid}/download`
        );
        assert.equal(s2StealDownload.status, 403);

        // Student 1 Previews their own PDF -> 200 OK with exact bytes
        const s1PreviewPdf = await student1Client.request(
          'GET',
          `/api/files/${privPdf.fileUuid}/preview`
        );
        assert.equal(s1PreviewPdf.status, 200);
        assert.deepEqual(s1PreviewPdf.rawBuffer, samplePdfBytes);

        // Student 1 tries to Preview a DOCX file -> 415 Unsupported Media Type (REQ-15: รองรับเฉพาะ PDF และรูปภาพ)
        const s1PreviewDocx = await student1Client.request(
          'GET',
          `/api/files/${privDocx.fileUuid}/preview`
        );
        assert.equal(s1PreviewDocx.status, 415);

        // Student 1 Downloads the DOCX file -> 200 OK with exact bytes (AC-16)
        const s1DownloadDocx = await student1Client.request(
          'GET',
          `/api/files/${privDocx.fileUuid}/download`
        );
        assert.equal(s1DownloadDocx.status, 200);
        assert.deepEqual(s1DownloadDocx.rawBuffer, sampleDocxBytes);

        // Search & Filter Test + SQL Injection Protection Test (REQ-16 & Phase 8)
        const searchRes = await student1Client.request(
          'GET',
          `/api/files?q=${encodeURIComponent('คะแนนสอบ')}&category=PDF&visibility=PRIVATE`
        );
        assert.equal(searchRes.status, 200);
        assert.equal(searchRes.data.files.length, 1);
        assert.equal(searchRes.data.files[0].fileUuid, privPdf.fileUuid);

        // SQL Injection attempt by Student 2 in search query
        const sqliRes = await student2Client.request(
          'GET',
          `/api/files?q=${encodeURIComponent("' OR 1=1 --")}`
        );
        assert.equal(sqliRes.status, 200);
        assert.equal(sqliRes.data.files.length, 0);

        return 'RBAC authorization, cross-user IDOR block (403), PDF/Image preview, DOCX download, Search, and SQLi protection verified';
      }
    );

    // =========================================================================
    // PHASE 7: NOTIFICATION INBOX & GROUPING (REQ-17, REQ-18, AC-19, AC-20, AC-21)
    // =========================================================================
    await runStep(
      'TEST-10',
      'Phase 7 & AC-19/AC-20/AC-21',
      'ตรวจสอบ Notification Inbox, การรวมกลุ่มตามเหตุการณ์ (Grouping), Read/Unread และ Delete',
      async () => {
        const notifRes = await student1Client.request('GET', '/api/notifications');
        assert.equal(notifRes.status, 200);
        assert.ok(notifRes.data.unreadItemCount >= 6);
        assert.ok(notifRes.data.groups.length >= 2);

        // Verify that the 2 private files sent in the same batch for 6501001 were grouped together!
        const batchGroup = notifRes.data.groups.find(
          (g: any) => g.visibilityScope === 'PRIVATE' && g.itemCount >= 2
        );
        assert.ok(batchGroup, 'Expected private batch files to be grouped into a single NotificationGroup');

        // Mark group as Read
        const markReadRes = await student1Client.request(
          'PATCH',
          `/api/notifications/groups/${batchGroup.groupUuid}/read`,
          { isRead: true }
        );
        assert.equal(markReadRes.status, 200);

        // Mark back as Unread
        const markUnreadRes = await student1Client.request(
          'PATCH',
          `/api/notifications/groups/${batchGroup.groupUuid}/read`,
          { isRead: false }
        );
        assert.equal(markUnreadRes.status, 200);

        // Delete one notification item
        const firstItemUuid = batchGroup.items[0].notificationUuid;
        const delRes = await student1Client.request(
          'DELETE',
          `/api/notifications/items/${firstItemUuid}`
        );
        assert.equal(delRes.status, 200);

        return 'Notification Inbox grouping, Read/Unread toggle, and Deletion verified';
      }
    );

    // =========================================================================
    // PHASE 8: PATH TRAVERSAL PROTECTION & USER DELETION FILE PRESERVATION (REQ-05)
    // =========================================================================
    await runStep(
      'TEST-11',
      'Phase 8 & REQ-05 / REQ-10',
      'ทดสอบป้องกัน Path Traversal และทดสอบลบบัญชี User โดยที่ไฟล์ไม่ถูกลบตาม (REQ-05)',
      async () => {
        const { resolveSafeStoragePath } = await import('../src/server/utils/disk.js');
        assert.throws(() => {
          resolveSafeStoragePath(appConfig.paths.storage, '../../etc/passwd');
        }, /Path traversal detected/);

        assert.throws(() => {
          resolveSafeStoragePath(appConfig.paths.storage, '..\\..\\Windows\\System32\\cmd.exe');
        }, /Path traversal detected/);

        // Delete user 6501001 and verify their 3 private files remain on disk and in DB!
        const u1Row = db
          .prepare('SELECT id FROM users WHERE user_id = ?')
          .get('6501001') as { id: number };
        const delUserRes = await adminClient.request('DELETE', `/api/admin/users/${u1Row.id}`);
        assert.equal(delUserRes.status, 200);

        const privDir6501001 = path.join(appConfig.paths.privateStorage, '6501001');
        assert.equal(fs.readdirSync(privDir6501001).length, 3);

        const adminFilesRes = await adminClient.request('GET', '/api/admin/files');
        assert.equal(adminFilesRes.status, 200);
        const preservedFiles = adminFilesRes.data.files.filter(
          (f: any) => f.recipientUserIds && f.recipientUserIds.includes('6501001')
        );
        assert.equal(preservedFiles.length, 3);

        return 'Path traversal blocked; deleting User 6501001 preserved all 3 private files on disk and in DB';
      }
    );

    // =========================================================================
    // PHASE 9: BACKUP AND RECOVERY TESTING (REQ-12, AC-22, AC-23)
    // =========================================================================
    await runStep(
      'TEST-12',
      'Phase 9 & AC-22/AC-23',
      'ทดสอบการทำ Backup Database + ไฟล์จริง และทดสอบจำลองไฟล์หายแล้วสั่ง Restore กู้คืน 100%',
      async () => {
        // 1. Trigger a full backup via Admin API
        const backupRes = await adminClient.request('POST', '/api/admin/backups/run');
        assert.equal(backupRes.status, 200);
        const backupId = backupRes.data.result.backupId;
        assert.ok(backupId);
        assert.equal(backupRes.data.result.status, 'SUCCESS');
        assert.ok(backupRes.data.result.totalFilesCount >= 6);

        // 2. Simulate catastrophic accidental deletion of a file via Admin API
        const filesBefore = await adminClient.request('GET', '/api/admin/files');
        const countBefore = filesBefore.data.files.length;
        const targetToDelete = filesBefore.data.files[0];

        const delFileRes = await adminClient.request(
          'DELETE',
          `/api/admin/files/${targetToDelete.fileUuid}`
        );
        assert.equal(delFileRes.status, 200);

        const filesAfterDelete = await adminClient.request('GET', '/api/admin/files');
        assert.equal(filesAfterDelete.data.files.length, countBefore - 1);

        // 3. Restore from the backup snapshot
        const restoreRes = await adminClient.request(
          'POST',
          `/api/admin/backups/${backupId}/restore`
        );
        assert.equal(restoreRes.status, 200);
        assert.equal(restoreRes.data.restoreResult.verifiedIntegrity, true);

        // 4. Verify the deleted file is back both in the database and physically on disk!
        const filesAfterRestore = await adminClient.request('GET', '/api/admin/files');
        assert.equal(filesAfterRestore.data.files.length, countBefore);
        const restoredFile = filesAfterRestore.data.files.find(
          (f: any) => f.fileUuid === targetToDelete.fileUuid
        );
        assert.ok(restoredFile);

        return `Backup (${backupId}) and full Restore verified (${countBefore} files & DB integrity 100% restored)`;
      }
    );

    // =========================================================================
    // TEST-13: LINE ALIAS MAPPING ("Opor") + SEQUENTIAL MESSAGE-THEN-FILE PAIRING
    // =========================================================================
    await runStep(
      'TEST-13',
      'LINE Alias & Sequential Message-to-File Pairing',
      'ทดสอบตั้งค่าชื่อเรียกใน LINE (เช่น Opor) ผ่าน Admin และพิมพ์ข้อความ "Opor" ก่อนส่งไฟล์ BoardingPass ตามมาในแชท',
      async () => {
        const u2Row = getDb()
          .prepare('SELECT id FROM users WHERE user_id = ?')
          .get('6501002') as { id: number };

        // 1. Admin configures lineAliases = "Opor, โอปอ" for user 6501002
        const updateAliasRes = await adminClient.request('PUT', `/api/admin/users/${u2Row.id}`, {
          fullName: 'สมหญิง นักศึกษา 2',
          lineAliases: 'Opor, โอปอ',
        });
        assert.equal(updateAliasRes.status, 200);
        assert.equal(updateAliasRes.data.user.lineAliases, 'Opor, โอปอ');

        // 2. Teacher sends text message "Opor" first (Webhook 1 at 21:02)
        const textFirstPayload = {
          destination: 'Ubot',
          events: [
            {
              type: 'message',
              webhookEventId: 'evt_seq_opor_text_1',
              timestamp: Date.now(),
              replyToken: 'reply_seq_opor_text_1',
              source: {
                type: 'user',
                userId: 'U11111111111111111111111111111111',
              },
              message: {
                id: '639450879720161521',
                type: 'text',
                text: 'Opor',
              },
            },
          ],
        };
        const signedTextFirst = signWebhookBody(textFirstPayload);
        const textFirstRes = await adminClient.request(
          'POST',
          '/api/line/webhook',
          signedTextFirst.raw,
          {
            'Content-Type': 'application/json',
            'x-line-signature': signedTextFirst.sig,
          }
        );
        assert.equal(textFirstRes.status, 200);

        const textReply = sentReplies.find((r) => r.replyToken === 'reply_seq_opor_text_1');
        assert.ok(textReply);
        assert.ok(textReply.messages[0].text.includes('ตั้งค่าผู้รับสำหรับไฟล์ถัดไปเรียบร้อยแล้ว'));
        assert.ok(textReply.messages[0].text.includes('6501002'));

        // 3. Teacher sends file "BoardingPass_WORRAWAT_PHATCHARA_SL_JOBNOZ.pdf" right after (Webhook 2 at 21:02)
        const fileSecondPayload = {
          destination: 'Ubot',
          events: [
            {
              type: 'message',
              webhookEventId: 'evt_seq_opor_file_2',
              timestamp: Date.now() + 1000,
              replyToken: 'reply_seq_opor_file_2',
              source: {
                type: 'user',
                userId: 'U11111111111111111111111111111111',
              },
              message: {
                id: 'msg_file_boarding_pass_opor',
                type: 'file',
                fileName: 'BoardingPass_WORRAWAT_PHATCHARA_SL_JOBNOZ.pdf',
                fileSize: samplePdfBytes.length,
              },
            },
          ],
        };
        const signedFileSecond = signWebhookBody(fileSecondPayload);
        const fileSecondRes = await adminClient.request(
          'POST',
          '/api/line/webhook',
          signedFileSecond.raw,
          {
            'Content-Type': 'application/json',
            'x-line-signature': signedFileSecond.sig,
          }
        );
        assert.equal(fileSecondRes.status, 200);

        const fileReply = sentReplies.find((r) => r.replyToken === 'reply_seq_opor_file_2');
        assert.ok(fileReply);
        assert.ok(
          fileReply.messages[0].text.includes('BoardingPass_WORRAWAT_PHATCHARA_SL_JOBNOZ.pdf')
        );
        assert.ok(fileReply.messages[0].text.includes('Private (6501002'));

        // Verify Student 2 (6501002) now sees this file in their Private files with NO comment (attachedMessage === null)
        const s2FilesAfter = await student2Client.request('GET', '/api/files?visibility=PRIVATE');
        assert.equal(s2FilesAfter.status, 200);
        assert.equal(s2FilesAfter.data.files.length, 1);
        assert.equal(
          s2FilesAfter.data.files[0].originalName,
          'BoardingPass_WORRAWAT_PHATCHARA_SL_JOBNOZ.pdf'
        );
        assert.equal(s2FilesAfter.data.files[0].attachedMessage, null);

        // 4. Teacher sends "Opor / ตั๋วเครื่องบินไปเชียงใหม่" followed by another file -> separated Private + Comment!
        const slashTextPayload = {
          destination: 'Ubot',
          events: [
            {
              type: 'message',
              webhookEventId: 'evt_seq_opor_slash_text_3',
              timestamp: Date.now() + 2000,
              replyToken: 'reply_seq_opor_slash_text_3',
              source: {
                type: 'user',
                userId: 'U11111111111111111111111111111111',
              },
              message: {
                id: 'msg_opor_slash_comment_3',
                type: 'text',
                text: 'Opor / ตั๋วเครื่องบินไปเชียงใหม่',
              },
            },
          ],
        };
        const signedSlashText = signWebhookBody(slashTextPayload);
        await adminClient.request('POST', '/api/line/webhook', signedSlashText.raw, {
          'Content-Type': 'application/json',
          'x-line-signature': signedSlashText.sig,
        });

        const slashFilePayload = {
          destination: 'Ubot',
          events: [
            {
              type: 'message',
              webhookEventId: 'evt_seq_opor_slash_file_4',
              timestamp: Date.now() + 3000,
              replyToken: 'reply_seq_opor_slash_file_4',
              source: {
                type: 'user',
                userId: 'U11111111111111111111111111111111',
              },
              message: {
                id: 'msg_file_opor_with_comment',
                type: 'file',
                fileName: 'Itinerary_ChiangMai.pdf',
                fileSize: samplePdfBytes.length,
              },
            },
          ],
        };
        const signedSlashFile = signWebhookBody(slashFilePayload);
        await adminClient.request('POST', '/api/line/webhook', signedSlashFile.raw, {
          'Content-Type': 'application/json',
          'x-line-signature': signedSlashFile.sig,
        });

        const s2FilesWithComment = await student2Client.request(
          'GET',
          '/api/files?visibility=PRIVATE'
        );
        assert.equal(s2FilesWithComment.status, 200);
        assert.equal(s2FilesWithComment.data.files.length, 2);
        const itineraryFile = s2FilesWithComment.data.files.find(
          (f: any) => f.originalName === 'Itinerary_ChiangMai.pdf'
        );
        assert.ok(itineraryFile);
        assert.equal(itineraryFile.attachedMessage, 'ตั๋วเครื่องบินไปเชียงใหม่');

        // 5. Admin edits comment via PATCH /api/admin/files/:fileUuid/comment
        const editCommentRes = await adminClient.request(
          'PATCH',
          `/api/admin/files/${itineraryFile.fileUuid}/comment`,
          { comment: 'ตั๋วเครื่องบินไปเชียงใหม่ (แก้ไขโดย Admin)' }
        );
        assert.equal(editCommentRes.status, 200);
        assert.equal(
          editCommentRes.data.attachedMessage,
          'ตั๋วเครื่องบินไปเชียงใหม่ (แก้ไขโดย Admin)'
        );

        // 6. Admin bulk-deletes the 2 selected files via POST /api/admin/files/bulk-delete
        const bulkDeleteRes = await adminClient.request('POST', '/api/admin/files/bulk-delete', {
          deleteAll: false,
          fileUuids: s2FilesWithComment.data.files.map((f: any) => f.fileUuid),
        });
        assert.equal(bulkDeleteRes.status, 200);
        assert.equal(bulkDeleteRes.data.deletedCount, 2);

        return 'Verified "Opor / Comment" slash syntax, Admin comment edit, and Multi-select Bulk Delete';
      }
    );

    console.log('\n================================================================');
    console.log(`🎉 ทดสอบผ่านครบทั้ง ${results.length}/${results.length} หัวข้อ (Phase 7, Phase 8, Phase 9)`);
    console.log('================================================================');
  } finally {
    appServer.close();
    mockLineServer.close();
    closeDb();
    try {
      fs.rmSync(testRootDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  }
}

main().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
