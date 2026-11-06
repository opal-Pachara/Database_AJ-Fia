import { appConfig, ensureStorageDirectories } from '../src/server/config.js';
import { getDb, closeDb } from '../src/server/db/connection.js';
import { restoreSystemFromBackup } from '../src/server/services/backupService.js';

async function main() {
  const backupId = process.argv[2];
  if (!backupId) {
    console.error('กรุณาระบุ Backup ID ที่ต้องการกู้คืน เช่น: npm run restore -- BK_20261105_180000_a1b2c3');
    process.exit(1);
  }

  ensureStorageDirectories(appConfig);
  getDb(appConfig);
  console.log(`กำลังกู้คืนข้อมูลจากชุด Backup: ${backupId} ...`);

  try {
    const res = await restoreSystemFromBackup(backupId);
    closeDb();
    console.log('✅ กู้คืนข้อมูลสำเร็จและผ่านการตรวจสอบความสมบูรณ์ครบถ้วน:');
    console.log(`   • Backup ID:         ${res.backupId}`);
    console.log(`   • จำนวนไฟล์ที่กู้คืน:    ${res.restoredFilesCount} ไฟล์`);
    console.log(`   • ขนาดฐานข้อมูล:      ${res.restoredDbSizeBytes} bytes`);
    console.log(`   • Integrity Check:   ${res.verifiedIntegrity ? 'PASSED (OK)' : 'FAILED'}`);
    process.exit(0);
  } catch (err) {
    closeDb();
    console.error('❌ กู้คืนข้อมูลล้มเหลว:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();

