# ============================================================================
# สคริปต์ลงทะเบียน Windows Task Scheduler เพื่อให้ Server เปิดอัตโนมัติเมื่อเครื่อง Restart
# วิธีรัน: เปิด PowerShell แบบ Run as Administrator แล้วรันไฟล์นี้
# REQ-01 & Section 11 & AC-26: ระบบสามารถกลับมาทำงานหลัง Restart เครื่องได้
# ============================================================================

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ServerScript = Join-Path $PSScriptRoot "windows-start-server.bat"
$TaskName = "LineOA_FileStorage_Server_AutoStart"

Write-Host "กำลังลงทะเบียน Task Scheduler: $TaskName ..." -ForegroundColor Cyan

$Action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$ServerScript`"" -WorkingDirectory $ProjectRoot
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Auto-start LINE OA File Storage Server on Windows boot" -Force

Write-Host "✅ ลงทะเบียนสำเร็จ! เมื่อเครื่อง Windows Restart ระบบจะเปิด Server ขึ้นมาทำงานอัตโนมัติ" -ForegroundColor Green

