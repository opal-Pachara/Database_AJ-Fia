import React, { useEffect, useState, useCallback } from 'react';
import {
  Users,
  UserPlus,
  Edit3,
  Trash2,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  PauseCircle,
  HardDrive,
  Database,
  Activity,
  RefreshCw,
  ArchiveRestore,
  FileText,
  AlertCircle,
} from 'lucide-react';
import {
  AdminUserItem,
  BackupLogItem,
  FileItem,
  SystemLogItem,
  SystemStatusData,
  WebhookLogItem,
} from '../types/index.js';
import { apiFetch, formatDateTimeThai, formatFileSize } from '../api/client.js';

export const AdminDashboard: React.FC = () => {
  const [subTab, setSubTab] = useState<'USERS' | 'FILES' | 'STATUS' | 'LOGS'>('USERS');

  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [adminFiles, setAdminFiles] = useState<FileItem[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatusData | null>(null);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLogItem[]>([]);
  const [backupLogs, setBackupLogs] = useState<BackupLogItem[]>([]);
  const [systemLogs, setSystemLogs] = useState<SystemLogItem[]>([]);

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Add User Form State
  const [newUserId, setNewUserId] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Edit User Modal State
  const [editingUser, setEditingUser] = useState<AdminUserItem | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'INACTIVE' | 'SUSPENDED'>('ACTIVE');

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, fRes, sRes, lRes] = await Promise.all([
        apiFetch<{ users: AdminUserItem[] }>('/api/admin/users'),
        apiFetch<{ files: FileItem[] }>('/api/admin/files'),
        apiFetch<SystemStatusData>('/api/admin/system-status'),
        apiFetch<{
          webhookLogs: WebhookLogItem[];
          backupLogs: BackupLogItem[];
          systemLogs: SystemLogItem[];
        }>('/api/admin/logs'),
      ]);
      setUsers(uRes.users);
      setAdminFiles(fRes.files);
      setSystemStatus(sRes);
      setWebhookLogs(lRes.webhookLogs);
      setBackupLogs(lRes.backupLogs);
      setSystemLogs(lRes.systemLogs);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลผู้ดูแลระบบได้',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const trimmedId = newUserId.trim();
      await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          userId: trimmedId,
          fullName: newFullName.trim(),
          password: newPassword.trim() || trimmedId,
          status: 'ACTIVE',
        }),
      });
      setNewUserId('');
      setNewFullName('');
      setNewPassword('');
      setFeedback({
        type: 'success',
        text: `เพิ่มบัญชีผู้ใช้งาน "${trimmedId}" สำเร็จ (รหัสผ่านเริ่มต้น: ${
          newPassword.trim() || trimmedId
        })`,
      });
      await loadAdminData();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'เพิ่มผู้ใช้งานไม่สำเร็จ',
      });
    }
  };

  const handleOpenEdit = (u: AdminUserItem) => {
    setEditingUser(u);
    setEditFullName(u.fullName);
    setEditPassword('');
    setEditStatus(u.status);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setFeedback(null);
    try {
      await apiFetch(`/api/admin/users/${editingUser.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          fullName: editFullName.trim(),
          password: editPassword.trim() || undefined,
          status: editStatus,
        }),
      });
      setEditingUser(null);
      setFeedback({
        type: 'success',
        text: `แก้ไขข้อมูลผู้ใช้งาน "${editingUser.userId}" เรียบร้อยแล้ว`,
      });
      await loadAdminData();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'แก้ไขข้อมูลไม่สำเร็จ',
      });
    }
  };

  const handleChangeStatus = async (
    u: AdminUserItem,
    status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
  ) => {
    setFeedback(null);
    try {
      await apiFetch(`/api/admin/users/${u.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setFeedback({
        type: 'success',
        text: `เปลี่ยนสถานะบัญชี "${u.userId}" เป็น ${status} เรียบร้อยแล้ว`,
      });
      await loadAdminData();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'เปลี่ยนสถานะไม่สำเร็จ',
      });
    }
  };

  const handleDeleteUser = async (u: AdminUserItem) => {
    if (
      !window.confirm(
        `ยืนยันการลบบัญชีผู้ใช้งาน "${u.userId} (${u.fullName})"?\n\nหมายเหตุตาม REQ-05: ไฟล์ของผู้ใช้งานคนนี้จะไม่ถูกลบออกจากระบบโดยอัตโนมัติ`
      )
    ) {
      return;
    }
    setFeedback(null);
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>(
        `/api/admin/users/${u.id}`,
        { method: 'DELETE' }
      );
      setFeedback({ type: 'success', text: res.message });
      await loadAdminData();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'ลบบัญชีไม่สำเร็จ',
      });
    }
  };

  const handleDeleteFile = async (f: FileItem) => {
    if (
      !window.confirm(
        `ยืนยันการลบไฟล์ "${f.originalName}" ออกจากเครื่อง Server อย่างถาวรหรือไม่?`
      )
    ) {
      return;
    }
    setFeedback(null);
    try {
      await apiFetch(`/api/admin/files/${encodeURIComponent(f.fileUuid)}`, {
        method: 'DELETE',
      });
      setFeedback({
        type: 'success',
        text: `ลบไฟล์ "${f.originalName}" เรียบร้อยแล้ว`,
      });
      await loadAdminData();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'ลบไฟล์ไม่สำเร็จ',
      });
    }
  };

  const handleTriggerBackup = async () => {
    setFeedback(null);
    setLoading(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        result: { backupId: string; totalFilesCount: number };
      }>('/api/admin/backups/run', { method: 'POST' });
      setFeedback({
        type: 'success',
        text: `สำรองข้อมูลสำเร็จ (รหัสชุดสำรอง: ${res.result.backupId}, จำนวนไฟล์: ${res.result.totalFilesCount} ไฟล์)`,
      });
      await loadAdminData();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'การสำรองข้อมูลล้มเหลว',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreBackup = async (backupId: string) => {
    if (
      !window.confirm(
        `ยืนยันการกู้คืนข้อมูล (Restore) จากชุดสำรอง "${backupId}" หรือไม่?\nระบบจะตรวจสอบค่า SHA-256 และความสมบูรณ์ของฐานข้อมูลก่อนทับข้อมูลปัจจุบัน`
      )
    ) {
      return;
    }
    setFeedback(null);
    setLoading(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        restoreResult: { backupId: string; restoredFilesCount: number };
      }>(`/api/admin/backups/${encodeURIComponent(backupId)}/restore`, {
        method: 'POST',
      });
      setFeedback({
        type: 'success',
        text: `กู้คืนระบบจากชุด "${res.restoreResult.backupId}" สำเร็จ (${res.restoreResult.restoredFilesCount} ไฟล์)`,
      });
      await loadAdminData();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'การกู้คืนข้อมูลล้มเหลว',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Admin Navigation Sub-Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('USERS')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
              subTab === 'USERS'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>จัดการบัญชีผู้ใช้งาน ({users.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('FILES')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
              subTab === 'FILES'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>ควบคุมไฟล์ในระบบ ({adminFiles.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('STATUS')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
              subTab === 'STATUS'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <HardDrive className="w-4 h-4" />
            <span>สถานะระบบและ Backup</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('LOGS')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
              subTab === 'LOGS'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>บันทึกการทำงาน (Webhook & Backup Logs)</span>
          </button>
        </div>

        <button
          type="button"
          onClick={loadAdminData}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-xs font-medium text-slate-700 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>รีเฟรชข้อมูล</span>
        </button>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs underline cursor-pointer"
          >
            ปิด
          </button>
        </div>
      )}

      {/* TAB 1: USER MANAGEMENT (REQ-05 & REQ-06) */}
      {subTab === 'USERS' && (
        <div className="space-y-6">
          {/* Add User Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <UserPlus className="w-5 h-5 text-emerald-600" />
              <h3 className="font-bold text-slate-900">เพิ่มบัญชีผู้ใช้งานใหม่ (Add User)</h3>
            </div>
            <form
              onSubmit={handleCreateUser}
              className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  รหัสผู้ใช้งาน (User ID) *
                </label>
                <input
                  type="text"
                  required
                  value={newUserId}
                  onChange={(e) => {
                    setNewUserId(e.target.value);
                    if (!newPassword) {
                      // Default password mirrors User ID automatically in placeholder
                    }
                  }}
                  placeholder="เช่น 6501001"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ชื่อ-นามสกุลผู้ใช้งาน *
                </label>
                <input
                  type="text"
                  required
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  placeholder="เช่น สมชาย ใจดี"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  รหัสผ่านเริ่มต้น (เว้นว่าง = ใช้ค่าเดียวกับ User ID)
                </label>
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={newUserId ? `ค่าเริ่มต้น: ${newUserId}` : 'เท่ากับ User ID'}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <div>
                <button
                  type="submit"
                  className="w-full py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-sm cursor-pointer"
                >
                  + เพิ่มบัญชีผู้ใช้งาน
                </button>
              </div>
            </form>
          </div>

          {/* Users Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="font-bold text-slate-900">รายชื่อบัญชีผู้ใช้งานทั้งหมด</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">User ID</th>
                    <th className="py-3 px-3">ชื่อผู้ใช้งาน</th>
                    <th className="py-3 px-3">บทบาท</th>
                    <th className="py-3 px-3">สถานะบัญชี</th>
                    <th className="py-3 px-3">รหัสผ่านเริ่มต้น</th>
                    <th className="py-3 px-3">ไฟล์ส่วนตัว</th>
                    <th className="py-3 px-4 text-right">การจัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="py-3.5 px-4 font-semibold text-slate-900">{u.userId}</td>
                      <td className="py-3.5 px-3 text-slate-800">{u.fullName}</td>
                      <td className="py-3.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                            u.role === 'ADMIN'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3.5 px-3">
                        {u.status === 'ACTIVE' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" /> ACTIVE (ปกติ)
                          </span>
                        )}
                        {u.status === 'INACTIVE' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 text-xs font-semibold">
                            <PauseCircle className="w-3.5 h-3.5" /> INACTIVE (ปิดใช้งาน)
                          </span>
                        )}
                        {u.status === 'SUSPENDED' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 text-xs font-semibold">
                            <XCircle className="w-3.5 h-3.5" /> SUSPENDED (ถูกระงับ)
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-xs">
                        {u.mustChangePassword ? (
                          <span className="text-amber-700 font-medium">รอเปลี่ยนรหัสครั้งแรก</span>
                        ) : (
                          <span className="text-emerald-700">เปลี่ยนแล้ว</span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-xs text-slate-600">
                        {u.privateFileCount} ไฟล์
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(u)}
                            className="px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-slate-100 text-xs font-medium text-slate-700 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> แก้ไข
                          </button>

                          {u.role !== 'ADMIN' && (
                            <>
                              {u.status !== 'ACTIVE' && (
                                <button
                                  type="button"
                                  onClick={() => handleChangeStatus(u, 'ACTIVE')}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-medium cursor-pointer"
                                >
                                  เปิดใช้งาน
                                </button>
                              )}
                              {u.status !== 'INACTIVE' && (
                                <button
                                  type="button"
                                  onClick={() => handleChangeStatus(u, 'INACTIVE')}
                                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium cursor-pointer"
                                >
                                  ปิดใช้งาน
                                </button>
                              )}
                              {u.status !== 'SUSPENDED' && (
                                <button
                                  type="button"
                                  onClick={() => handleChangeStatus(u, 'SUSPENDED')}
                                  className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <ShieldAlert className="w-3.5 h-3.5" /> ระงับ
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u)}
                                className="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> ลบ
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ADMIN FILE CONTROL (REQ-05 & REQ-10) */}
      {subTab === 'FILES' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900">
                รายการไฟล์ทั้งหมดในระบบ (รวมไฟล์ส่วนตัวและไฟล์ Public)
              </h3>
              <p className="text-xs text-slate-500">
                ไฟล์จะถูกเก็บถาวรจนกว่า Admin จะสั่งลบเอง (การลบบัญชี User จะไม่ทำให้ไฟล์ในตารางนี้หายไป)
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-600">
              ทั้งหมด {adminFiles.length} ไฟล์
            </span>
          </div>

          {adminFiles.length === 0 ? (
            <div className="p-10 text-center text-slate-500 text-sm">ยังไม่มีไฟล์ในระบบ</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">ชื่อไฟล์ต้นฉบับ</th>
                    <th className="py-3 px-3">พื้นที่ / ผู้รับ</th>
                    <th className="py-3 px-3">ขนาด</th>
                    <th className="py-3 px-3">ข้อความแนบ</th>
                    <th className="py-3 px-3">เวลาที่ได้รับ</th>
                    <th className="py-3 px-4 text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {adminFiles.map((f) => (
                    <tr key={f.fileUuid} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900">{f.originalName}</p>
                        <p className="text-[11px] text-slate-400 font-mono">UUID: {f.fileUuid}</p>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                            f.visibility === 'PRIVATE'
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {f.visibility}
                        </span>
                        {f.recipientUserIds && (
                          <p className="text-xs text-slate-600 mt-1">
                            ผู้รับ: {f.recipientUserIds}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-600">
                        {formatFileSize(f.fileSizeBytes)}
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-600 max-w-xs">
                        {f.attachedMessage || '-'}
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-600 whitespace-nowrap">
                        {formatDateTimeThai(f.receivedAt)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleDeleteFile(f)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>ลบไฟล์</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SYSTEM STATUS & BACKUP (REQ-12 & Section 10.5) */}
      {subTab === 'STATUS' && systemStatus && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Disk Space Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center gap-2.5 text-slate-800 font-bold mb-3">
                <HardDrive className="w-5 h-5 text-emerald-600" />
                <h4>พื้นที่จัดเก็บข้อมูลบน Disk</h4>
              </div>
              <div className="space-y-2 text-xs text-slate-600">
                <p>
                  <span className="font-semibold text-slate-800">Storage Path:</span>{' '}
                  <code className="bg-slate-100 px-1.5 py-0.5 rounded">
                    {systemStatus.storageRootPath}
                  </code>
                </p>
                <p>
                  <span className="font-semibold text-slate-800">พื้นที่ว่าง (Free):</span>{' '}
                  <span className="text-emerald-700 font-bold">
                    {formatFileSize(systemStatus.disk.freeBytes)}
                  </span>{' '}
                  / ทั้งหมด {formatFileSize(systemStatus.disk.totalBytes)}
                </p>
                <p>
                  <span className="font-semibold text-slate-800">ขนาดไฟล์ที่เก็บในระบบ:</span>{' '}
                  {formatFileSize(systemStatus.counts.totalStorageBytes)} (
                  {systemStatus.counts.totalFileCount} ไฟล์)
                </p>
              </div>
            </div>

            {/* Database & LINE Status Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center gap-2.5 text-slate-800 font-bold mb-3">
                <Database className="w-5 h-5 text-indigo-600" />
                <h4>ฐานข้อมูลและ LINE OA</h4>
              </div>
              <div className="space-y-2 text-xs text-slate-600">
                <p>
                  <span className="font-semibold text-slate-800">ขนาด SQLite DB:</span>{' '}
                  {formatFileSize(systemStatus.database.sizeBytes)}
                </p>
                <p>
                  <span className="font-semibold text-slate-800">Channel Secret:</span>{' '}
                  {systemStatus.lineConfig.hasChannelSecret
                    ? '✅ ตั้งค่าแล้ว'
                    : '⚠️ ยังไม่ได้ตั้งค่าใน .env'}
                </p>
                <p>
                  <span className="font-semibold text-slate-800">Channel Access Token:</span>{' '}
                  {systemStatus.lineConfig.hasChannelAccessToken
                    ? '✅ ตั้งค่าแล้ว'
                    : '⚠️ ยังไม่ได้ตั้งค่าใน .env'}
                </p>
                <p>
                  <span className="font-semibold text-slate-800">โหมดระบุผู้รับ:</span>{' '}
                  {systemStatus.lineConfig.recipientSyntaxMode}
                </p>
              </div>
            </div>

            {/* Backup Control Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2.5 text-slate-800 font-bold mb-3">
                  <ArchiveRestore className="w-5 h-5 text-amber-600" />
                  <h4>ระบบสำรองข้อมูลอัตโนมัติ (ทุก 6 ชม.)</h4>
                </div>
                <div className="space-y-1.5 text-xs text-slate-600 mb-4">
                  <p>
                    <span className="font-semibold text-slate-800">Backup Path:</span>{' '}
                    <code className="bg-slate-100 px-1.5 py-0.5 rounded">
                      {systemStatus.backupRootPath}
                    </code>
                  </p>
                  <p>
                    <span className="font-semibold text-slate-800">ตารางเวลา Cron:</span>{' '}
                    <code>{systemStatus.backupSchedule}</code>
                  </p>
                  {systemStatus.latestBackup ? (
                    <p>
                      <span className="font-semibold text-slate-800">Backup ล่าสุด:</span>{' '}
                      {systemStatus.latestBackup.backupId} ({systemStatus.latestBackup.status}) เมื่อ{' '}
                      {formatDateTimeThai(systemStatus.latestBackup.completedAt)}
                    </p>
                  ) : (
                    <p className="text-slate-400">ยังไม่มีประวัติการสำรองข้อมูล</p>
                  )}
                </div>
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={handleTriggerBackup}
                className="w-full py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold cursor-pointer"
              >
                สั่งสำรองข้อมูลทันที (Run Backup Now)
              </button>
            </div>
          </div>

          {/* Backup Snapshots & Restore Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="font-bold text-slate-900">
                ชุดสำรองข้อมูลทั้งหมดและการกู้คืนระบบ (Backup & Restore)
              </h3>
            </div>
            {backupLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                ยังไม่มีประวัติการ Backup
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">Backup ID</th>
                      <th className="py-3 px-3">ประเภท</th>
                      <th className="py-3 px-3">สถานะ</th>
                      <th className="py-3 px-3">ขนาด DB</th>
                      <th className="py-3 px-3">จำนวนไฟล์</th>
                      <th className="py-3 px-3">เวลาที่เสร็จสิ้น</th>
                      <th className="py-3 px-4 text-right">การกู้คืน (Restore)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {backupLogs.map((bk) => (
                      <tr key={bk.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900">
                          {bk.backupId}
                        </td>
                        <td className="py-3 px-3 text-xs">{bk.backupType}</td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                              bk.status === 'SUCCESS' || bk.status === 'RESTORED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : bk.status === 'FAILED'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {bk.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-xs">{formatFileSize(bk.dbSizeBytes)}</td>
                        <td className="py-3 px-3 text-xs">
                          {bk.totalFilesCount} ไฟล์ ({formatFileSize(bk.totalFilesBytes)})
                        </td>
                        <td className="py-3 px-3 text-xs">
                          {formatDateTimeThai(bk.completedAt || bk.startedAt)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {(bk.status === 'SUCCESS' || bk.status === 'RESTORED') && (
                            <button
                              type="button"
                              onClick={() => handleRestoreBackup(bk.backupId)}
                              className="px-3 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-xs font-semibold cursor-pointer"
                            >
                              กู้คืนข้อมูลจากชุดนี้
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: WEBHOOK & SYSTEM LOGS (Section 10.5) */}
      {subTab === 'LOGS' && (
        <div className="space-y-6">
          {/* LINE Webhook Events Log */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="font-bold text-slate-900">
                ประวัติการรับข้อมูลจาก LINE OA Webhook (100 รายการล่าสุด)
              </h3>
            </div>
            {webhookLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                ยังไม่มีประวัติการรับ Webhook จาก LINE OA
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">เวลา</th>
                      <th className="py-3 px-3">Webhook Event ID</th>
                      <th className="py-3 px-3">ผู้ส่ง (LINE userId)</th>
                      <th className="py-3 px-3">ประเภท</th>
                      <th className="py-3 px-3">สถานะการประมวลผล</th>
                      <th className="py-3 px-3">สถานะการตอบกลับ (Reply)</th>
                      <th className="py-3 px-4">หมายเหตุ / Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {webhookLogs.map((w) => (
                      <tr key={w.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          {formatDateTimeThai(w.receivedAt)}
                        </td>
                        <td className="py-2.5 px-3 font-mono">{w.webhookEventId}</td>
                        <td className="py-2.5 px-3 font-mono">{w.senderLineUserId}</td>
                        <td className="py-2.5 px-3">{w.messageType || w.eventType}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded font-semibold ${
                              w.processingStatus === 'SUCCESS'
                                ? 'bg-emerald-100 text-emerald-800'
                                : w.processingStatus === 'FAILED'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {w.processingStatus}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">{w.replyStatus}</td>
                        <td className="py-2.5 px-4 text-red-600 max-w-xs truncate">
                          {w.errorMessage || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* System & Security Logs */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="font-bold text-slate-900">
                บันทึกเหตุการณ์ระบบและความปลอดภัย (System & Security Logs)
              </h3>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-2.5 px-4">เวลา</th>
                    <th className="py-2.5 px-3">ระดับ</th>
                    <th className="py-2.5 px-3">หมวดหมู่</th>
                    <th className="py-2.5 px-3">เหตุการณ์ (Action)</th>
                    <th className="py-2.5 px-3">ผู้ดำเนินการ</th>
                    <th className="py-2.5 px-4">รายละเอียด</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {systemLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="py-2 px-4 whitespace-nowrap">
                        {formatDateTimeThai(log.createdAt)}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-2 py-0.5 rounded font-semibold ${
                            log.level === 'ERROR' || log.level === 'SECURITY'
                              ? 'bg-red-100 text-red-800'
                              : log.level === 'WARN'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {log.level}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-medium">{log.category}</td>
                      <td className="py-2 px-3 font-mono">{log.action}</td>
                      <td className="py-2 px-3">{log.actorUserId || '-'}</td>
                      <td className="py-2 px-4 font-mono text-[11px] text-slate-600 max-w-md truncate">
                        {log.detailsJson || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              แก้ไขข้อมูลผู้ใช้งาน: {editingUser.userId}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              สามารถแก้ไขชื่อ รีเซ็ตรหัสผ่าน หรือปรับสถานะบัญชีได้
            </p>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ชื่อ-นามสกุลผู้ใช้งาน
                </label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ตั้งรหัสผ่านใหม่ (เว้นว่างไว้หากไม่ต้องการเปลี่ยน)
                </label>
                <input
                  type="text"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="เว้นว่างหากใช้รหัสเดิม"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              {editingUser.role !== 'ADMIN' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    สถานะบัญชี
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) =>
                      setEditStatus(e.target.value as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED')
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                  >
                    <option value="ACTIVE">ACTIVE (เปิดใช้งานปกติ)</option>
                    <option value="INACTIVE">INACTIVE (ปิดใช้งาน)</option>
                    <option value="SUSPENDED">SUSPENDED (ระงับการใช้งาน)</option>
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm cursor-pointer"
                >
                  บันทึกการแก้ไข
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

