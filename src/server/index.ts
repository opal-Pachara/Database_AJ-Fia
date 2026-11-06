import { appConfig, ensureStorageDirectories } from './config.js';
import { getDb, closeDb } from './db/connection.js';
import { ensureInitialAdmin } from './db/seed.js';
import { createApp } from './app.js';
import {
  startAutomatedBackupScheduler,
  stopAutomatedBackupScheduler,
} from './services/backupService.js';
import { writeSystemLog } from './utils/logger.js';

async function bootstrap(): Promise<void> {
  ensureStorageDirectories(appConfig);
  const db = getDb(appConfig);
  await ensureInitialAdmin(db, appConfig);

  startAutomatedBackupScheduler();

  const app = createApp();
  const server = app.listen(appConfig.port, appConfig.host, () => {
    console.log('================================================================');
    console.log(' ระบบรับฝากและดาวน์โหลดไฟล์ผ่าน LINE OA พร้อมทำงานแล้ว');
    console.log(` • Local URL:       http://${appConfig.host}:${appConfig.port}`);
    console.log(` • Webhook Path:    http://${appConfig.host}:${appConfig.port}/api/line/webhook`);
    console.log(` • Storage Root:    ${appConfig.storageRootPath}`);
    console.log(` • Database Path:   ${appConfig.paths.databaseFile}`);
    console.log(` • Backup Path:     ${appConfig.backupRootPath}`);
    console.log(` • Backup Schedule: ${appConfig.backup.cronSchedule} (ทุก 6 ชั่วโมง)`);
    console.log('================================================================');

    writeSystemLog({
      level: 'INFO',
      category: 'SYSTEM',
      action: 'SERVER_STARTED',
      details: {
        host: appConfig.host,
        port: appConfig.port,
        storageRootPath: appConfig.storageRootPath,
      },
    });
  });

  const shutdown = (signal: string) => {
    console.log(`\nได้รับสัญญาณ ${signal} กำลังปิดระบบอย่างปลอดภัย...`);
    stopAutomatedBackupScheduler();
    server.close(() => {
      closeDb();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

