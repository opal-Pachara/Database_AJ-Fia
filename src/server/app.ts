import fs from 'node:fs';
import path from 'node:path';
import express, { Express, Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { authRouter } from './routes/authRoutes.js';
import { fileRouter } from './routes/fileRoutes.js';
import { notificationRouter } from './routes/notificationRoutes.js';
import { adminRouter } from './routes/adminRoutes.js';
import { lineWebhookRouter } from './routes/lineWebhookRoutes.js';

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);

  // Security headers (Section 8: XSS Protection, framing for same-origin PDF preview)
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          mediaSrc: ["'self'", 'data:', 'blob:'],
          frameSrc: ["'self'", 'blob:'],
          objectSrc: ["'self'", 'blob:'],
          frameAncestors: ["'self'"],
          upgradeInsecureRequests: null,
        },
      },
      strictTransportSecurity: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  // Clear any previously cached HSTS on localhost/127.0.0.1
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Strict-Transport-Security', 'max-age=0');
    next();
  });

  app.use(cookieParser());

  // Capture raw body for /api/line/webhook X-Line-Signature verification (Section 7 ข้อ 1)
  app.use(
    express.json({
      limit: '2mb',
      verify: (req: Request, _res: Response, buf: Buffer) => {
        if (req.originalUrl?.startsWith('/api/line/webhook')) {
          req.rawBody = Buffer.from(buf);
        }
      },
    })
  );

  // Health check endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Mount API routes
  app.use('/api/auth', authRouter);
  app.use('/api/files', fileRouter);
  app.use('/api/notifications', notificationRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/line', lineWebhookRouter);

  // Serve built React Frontend static files in production
  const clientDistDir = path.resolve(process.cwd(), 'dist', 'client');
  if (fs.existsSync(clientDistDir)) {
    app.use(express.static(clientDistDir));
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(path.join(clientDistDir, 'index.html'));
    });
  }

  // Fallback 404 for unknown API routes
  app.use('/api/*', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'ไม่พบ API Endpoint ที่ร้องขอ' });
  });

  return app;
}

