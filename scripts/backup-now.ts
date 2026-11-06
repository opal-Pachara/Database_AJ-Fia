import { appConfig, ensureStorageDirectories } from '../src/server/config.js';
import { getDb, closeDb } from '../src/server/db/connection.js';
import { performSystemBackup } from '../src/server/services/backupService.js';

async function main() {
  ensureStorageDirectories(appConfig);
  getDb(appConfig);
  console.log('กำลังเริ่มสำรองฐานข้อมูลและไฟล์ทั้งหมด...');
  const result = await performSystemBackup('MANUAL');
  closeDb();

  if (result.status === 'SUCCESS') {
    console.log('✅ สำรองข้อมูลสำเร็จ:');
    console.log(`   • Backup ID:    ${result.backupId}`);
    console.log(`   • โฟลเดอร์ปลายทาง: ${result.targetPath}`);
    console.log(`   • ขนาด DB:      ${result.dbSizeBytes} bytes`);
    console.log(`   • จำนวนไฟล์:     ${result.totalFilesCount} ไฟล์ (${result.totalFilesBytes} bytes)`);
    console.log(`   • Manifest SHA: ${result.manifestSha256}`);
    process.exit(0);
  } else {
    console.error('❌ สำรองข้อมูลล้มเหลว:', result.errorMessage);
    process.exit(1);
  }
}

main();

