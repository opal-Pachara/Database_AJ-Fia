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
  Eye,
  Play,
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
import { FilePreviewModal } from './FilePreviewModal.js';

export type AdminSubTabKey = 'USERS' | 'FILES' | 'STATUS' | 'LOGS';

interface AdminDashboardProps {
  refreshTrigger?: number;
  activeSubTab?: AdminSubTabKey;
  onSubTabChange?: (tab: AdminSubTabKey) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  refreshTrigger = 0,
  activeSubTab: controlledSubTab,
  onSubTabChange,
}) => {
  const [internalSubTab, setInternalSubTab] = useState<AdminSubTabKey>('USERS');
  const subTab = controlledSubTab !== undefined ? controlledSubTab : internalSubTab;
  const setSubTab = useCallback(
    (tab: AdminSubTabKey) => {
      if (onSubTabChange) {
        onSubTabChange(tab);
      } else {
        setInternalSubTab(tab);
      }
    },
    [onSubTabChange]
  );

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
  const [newLineAliases, setNewLineAliases] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Edit User Modal State
  const [editingUser, setEditingUser] = useState<AdminUserItem | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editLineAliases, setEditLineAliases] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'INACTIVE' | 'SUSPENDED'>('ACTIVE');

  // Inline File Comment Edit State
  const [editingCommentFileUuid, setEditingCommentFileUuid] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');

  // Multi-select File Deletion & Popup Alert Modal State
  const [selectedFileUuids, setSelectedFileUuids] = useState<string[]>([]);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    mode: 'SINGLE' | 'SELECTED' | 'ALL';
    files: FileItem[];
  } | null>(null);
  const [deletingFiles, setDeletingFiles] = useState(false);
  const [adminCategoryFilter, setAdminCategoryFilter] = useState<string>('ALL');
  const [adminPreviewFile, setAdminPreviewFile] = useState<FileItem | null>(null);

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
      setSelectedFileUuids((prev) =>
        prev.filter((uuid) => fRes.files.some((f) => f.fileUuid === uuid))
      );
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
  }, [loadAdminData, refreshTrigger]);

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
          lineAliases: newLineAliases.trim(),
          password: newPassword.trim() || trimmedId,
          status: 'ACTIVE',
        }),
      });
      setNewUserId('');
      setNewFullName('');
      setNewLineAliases('');
      setNewPassword('');
      setFeedback({
        type: 'success',
        text: `เพิ่มบัญชีผู้ใช้งาน "${trimmedId}" สำเร็จ (รหัสผ่านเริ่มต้น: ${newPassword.trim() || trimmedId
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
    setEditLineAliases(u.lineAliases || '');
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
          lineAliases: editLineAliases.trim(),
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

  const handleReassignFileRecipient = async (f: FileItem, targetUserId: string) => {
    setFeedback(null);
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>(
        `/api/admin/files/${encodeURIComponent(f.fileUuid)}/recipient`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            recipientUserId: targetUserId === 'PUBLIC' ? null : targetUserId,
          }),
        }
      );
      setFeedback({
        type: 'success',
        text: res.message,
      });
      await loadAdminData();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'เปลี่ยนผู้รับไฟล์ไม่สำเร็จ',
      });
    }
  };

  const handleSaveFileComment = async (fileUuid: string) => {
    setFeedback(null);
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>(
        `/api/admin/files/${encodeURIComponent(fileUuid)}/comment`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            comment: editingCommentText,
          }),
        }
      );
      setEditingCommentFileUuid(null);
      setEditingCommentText('');
      setFeedback({
        type: 'success',
        text: res.message,
      });
      await loadAdminData();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'แก้ไขข้อความที่ฝากไม่สำเร็จ',
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

  const toggleSelectFile = (fileUuid: string) => {
    setSelectedFileUuids((prev) =>
      prev.includes(fileUuid) ? prev.filter((id) => id !== fileUuid) : [...prev, fileUuid]
    );
  };

  const toggleSelectAllFiles = () => {
    if (adminFiles.length === 0) return;
    if (selectedFileUuids.length === adminFiles.length) {
      setSelectedFileUuids([]);
    } else {
      setSelectedFileUuids(adminFiles.map((f) => f.fileUuid));
    }
  };

  const handleDeleteFile = (f: FileItem) => {
    setDeleteConfirmModal({
      mode: 'SINGLE',
      files: [f],
    });
  };

  const handleOpenDeleteSelected = () => {
    const selectedItems = adminFiles.filter((f) => selectedFileUuids.includes(f.fileUuid));
    if (selectedItems.length === 0) return;
    setDeleteConfirmModal({
      mode: 'SELECTED',
      files: selectedItems,
    });
  };

  const handleOpenDeleteAll = () => {
    if (adminFiles.length === 0) return;
    setDeleteConfirmModal({
      mode: 'ALL',
      files: adminFiles,
    });
  };

  const handleExecuteDeleteFiles = async () => {
    if (!deleteConfirmModal) return;
    setFeedback(null);
    setDeletingFiles(true);
    try {
      const targetUuids = deleteConfirmModal.files.map((f) => f.fileUuid);
      const isDeleteAll = deleteConfirmModal.mode === 'ALL';
      const res = await apiFetch<{ ok: boolean; deletedCount: number; message: string }>(
        '/api/admin/files/bulk-delete',
        {
          method: 'POST',
          body: JSON.stringify({
            deleteAll: isDeleteAll,
            fileUuids: targetUuids,
          }),
        }
      );
      setDeleteConfirmModal(null);
      setSelectedFileUuids([]);
      setFeedback({
        type: 'success',
        text: res.message || `ลบไฟล์สำเร็จทั้งหมด ${res.deletedCount} รายการ`,
      });
      await loadAdminData();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'ลบไฟล์ไม่สำเร็จ',
      });
    } finally {
      setDeletingFiles(false);
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
      {/* Admin Navigation Sub-Tabs (Responsive 2x2 Grid in Portrait Mode) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('USERS')}
            className={`inline-flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
              subTab === 'USERS'
                ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF]'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span className="truncate">ผู้ใช้งาน ({users.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('FILES')}
            className={`inline-flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
              subTab === 'FILES'
                ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF]'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span className="truncate">ควบคุมไฟล์ ({adminFiles.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('STATUS')}
            className={`inline-flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
              subTab === 'STATUS'
                ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF]'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <HardDrive className="w-4 h-4 shrink-0" />
            <span className="truncate">สถานะ & Backup</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('LOGS')}
            className={`inline-flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
              subTab === 'LOGS'
                ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF]'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Activity className="w-4 h-4 shrink-0" />
            <span className="truncate">ประวัติ (Logs)</span>
          </button>
        </div>

        <button
          type="button"
          onClick={loadAdminData}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-xs font-medium text-slate-700 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>รีเฟรชข้อมูล</span>
        </button>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-sm ${feedback.type === 'success'
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
              className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
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
                  ชื่อเรียกใน LINE (คั่นด้วย ,)
                </label>
                <input
                  type="text"
                  value={newLineAliases}
                  onChange={(e) => setNewLineAliases(e.target.value)}
                  placeholder="เช่น Opor, โอปอ"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  รหัสผ่านเริ่มต้น (เว้นว่าง = User ID)
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

          {/* Users Table (Responsive Portrait Cards + Desktop Table) */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 sm:px-5 py-4 border-b border-slate-200">
              <h3 className="font-bold text-slate-900">รายชื่อบัญชีผู้ใช้งานทั้งหมด</h3>
            </div>

            {/* Portrait Mobile Cards (< md) */}
            <div className="md:hidden divide-y divide-slate-200">
              {users.map((u) => (
                <div key={`mob-u-${u.id}`} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {u.fullName}{' '}
                        <span className="text-xs font-mono text-slate-500">({u.userId})</span>
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                            u.role === 'ADMIN'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {u.role}
                        </span>
                        {u.status === 'ACTIVE' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-semibold">
                            ACTIVE (ปกติ)
                          </span>
                        )}
                        {u.status === 'INACTIVE' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[11px] font-semibold">
                            INACTIVE
                          </span>
                        )}
                        {u.status === 'SUSPENDED' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[11px] font-semibold">
                            SUSPENDED
                          </span>
                        )}
                        <span className="text-xs text-slate-500">
                          • ไฟล์ส่วนตัว {u.privateFileCount} ไฟล์
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600">
                    <span className="font-semibold">ชื่อเรียกใน LINE: </span>
                    {u.lineAliases ? (
                      <span className="text-indigo-700 font-semibold">{u.lineAliases}</span>
                    ) : (
                      <span className="text-slate-400">ตรงกับ {u.userId} / {u.fullName}</span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(u)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 inline-flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> แก้ไขข้อมูล / ชื่อ LINE
                    </button>
                    {u.role !== 'ADMIN' && (
                      <>
                        {u.status !== 'ACTIVE' && (
                          <button
                            type="button"
                            onClick={() => handleChangeStatus(u, 'ACTIVE')}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold"
                          >
                            เปิดใช้งาน
                          </button>
                        )}
                        {u.status !== 'SUSPENDED' && (
                          <button
                            type="button"
                            onClick={() => handleChangeStatus(u, 'SUSPENDED')}
                            className="px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-800 text-xs font-semibold"
                          >
                            ระงับ
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(u)}
                          className="px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-semibold inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> ลบ
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">User ID</th>
                    <th className="py-3 px-3">ชื่อผู้ใช้งาน</th>
                    <th className="py-3 px-3">ชื่อเรียกใน LINE (Aliases)</th>
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
                        {u.lineAliases ? (
                          <div className="flex flex-wrap gap-1">
                            {u.lineAliases
                              .split(',')
                              .map((a) => a.trim())
                              .filter(Boolean)
                              .map((alias) => (
                                <span
                                  key={alias}
                                  className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-medium"
                                >
                                  {alias}
                                </span>
                              ))}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">
                            (ตรงกับ {u.userId} / {u.fullName})
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-md text-xs font-semibold ${u.role === 'ADMIN'
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
        <div className="space-y-4">
          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 text-xs text-indigo-950 space-y-1.5">
            <p className="font-bold text-indigo-900">
              💡 วิธีพิมพ์ในแชท LINE OA เพื่อแยก "ผู้รับไฟล์ (Private/Public)" กับ "ข้อความที่ฝาก (Comment)":
            </p>
            <ul className="list-disc list-inside space-y-1 text-indigo-800">
              <li>
                <code className="bg-white px-1.5 py-0.5 rounded border border-indigo-200 font-mono">
                  Opor / ปริญญานิพนธ์ตัวอย่าง
                </code>{' '}
                → เก็บเป็น <strong>Private (เฉพาะ Opor)</strong> + แสดงข้อความที่ฝาก:{' '}
                <em>"ปริญญานิพนธ์ตัวอย่าง"</em>
              </li>
              <li>
                <code className="bg-white px-1.5 py-0.5 rounded border border-indigo-200 font-mono">
                  Opor
                </code>{' '}
                → เก็บเป็น <strong>Private (เฉพาะ Opor)</strong> โดยไม่มีข้อความที่ฝาก (ช่อง Comment ว่าง{' '}
                <code className="font-mono">-</code>)
              </li>
              <li>
                <code className="bg-white px-1.5 py-0.5 rounded border border-indigo-200 font-mono">
                  / เอกสารประกอบการเรียนบทที่ 1
                </code>{' '}
                หรือพิมพ์ข้อความที่ไม่ตรงกับชื่อใคร → เก็บเป็น <strong>Public (ส่วนกลาง)</strong> + แสดงข้อความที่ฝาก
              </li>
            </ul>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900">
                  รายการไฟล์ทั้งหมดในระบบ (รวมไฟล์ส่วนตัวและไฟล์ Public)
                </h3>
                <p className="text-xs text-slate-500">
                  สามารถติ๊กเลือกหลายไฟล์เพื่อลบพร้อมกัน หรือกดปุ่มลบทั้งหมดได้
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-600 mr-1">
                  ทั้งหมด {adminFiles.length} ไฟล์
                  {selectedFileUuids.length > 0 && (
                    <span className="text-red-600 ml-1">
                      (เลือกไว้ {selectedFileUuids.length} รายการ)
                    </span>
                  )}
                </span>

                <button
                  type="button"
                  disabled={selectedFileUuids.length === 0}
                  onClick={handleOpenDeleteSelected}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${selectedFileUuids.length > 0
                    ? 'bg-red-600 hover:bg-red-700 text-white shadow-xs cursor-pointer'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>ลบที่เลือก ({selectedFileUuids.length} รายการ)</span>
                </button>

                <button
                  type="button"
                  disabled={adminFiles.length === 0}
                  onClick={handleOpenDeleteAll}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${adminFiles.length > 0
                    ? 'bg-red-50 hover:bg-red-100 border-red-300 text-red-700 cursor-pointer'
                    : 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>ลบทั้งหมด ({adminFiles.length} รายการ)</span>
                </button>
              </div>
            </div>

            {/* Category Filter Pills in Admin Files View */}
            <div className="px-5 py-3 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-600 mr-1">หมวดหมู่:</span>
              {[
                { key: 'ALL', label: `ทั้งหมด (${adminFiles.length})` },
                {
                  key: 'PDF',
                  label: `📄 PDF (${adminFiles.filter((f) => f.fileCategory === 'PDF').length})`,
                },
                {
                  key: 'VIDEO',
                  label: `🎬 Video (${adminFiles.filter((f) => f.fileCategory === 'VIDEO').length})`,
                },
                {
                  key: 'IMAGE',
                  label: `🖼️ รูปภาพ (${adminFiles.filter((f) => f.fileCategory === 'IMAGE').length})`,
                },
                {
                  key: 'DOCUMENT',
                  label: `📝 เอกสาร (${adminFiles.filter((f) => f.fileCategory === 'DOCUMENT').length})`,
                },
                {
                  key: 'AUDIO',
                  label: `🎵 เสียง (${adminFiles.filter((f) => f.fileCategory === 'AUDIO').length})`,
                },
                {
                  key: 'ARCHIVE',
                  label: `📦 ZIP/RAR (${adminFiles.filter((f) => f.fileCategory === 'ARCHIVE').length})`,
                },
                {
                  key: 'OTHER',
                  label: `📎 อื่นๆ (${adminFiles.filter((f) => f.fileCategory === 'OTHER').length})`,
                },
              ].map((cat) => (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setAdminCategoryFilter(cat.key)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
                    adminCategoryFilter === cat.key
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {adminFiles.length === 0 ? (
              <div className="p-10 text-center text-slate-500 text-sm">ยังไม่มีไฟล์ในระบบ</div>
            ) : (
              <>
                {/* Portrait Mobile File Cards (< md) */}
                <div className="md:hidden divide-y divide-slate-200">
                  <div className="px-4 py-2.5 bg-slate-50 flex items-center justify-between text-xs font-semibold text-slate-700">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={
                          adminFiles.length > 0 && selectedFileUuids.length === adminFiles.length
                        }
                        onChange={toggleSelectAllFiles}
                        className="w-4 h-4 rounded border-slate-300 text-red-600"
                      />
                      <span>เลือกไฟล์ทั้งหมดในหน้านี้</span>
                    </label>
                    {selectedFileUuids.length > 0 && (
                      <span className="text-red-600">เลือกแล้ว {selectedFileUuids.length} รายการ</span>
                    )}
                  </div>

                  {adminFiles
                    .filter(
                      (f) => adminCategoryFilter === 'ALL' || f.fileCategory === adminCategoryFilter
                    )
                    .map((f) => {
                      const isSelected = selectedFileUuids.includes(f.fileUuid);
                      const canPreview =
                        f.isPreviewable ||
                        ['PDF', 'IMAGE', 'VIDEO', 'AUDIO'].includes(f.fileCategory);
                      return (
                        <div
                          key={`mob-f-${f.fileUuid}`}
                          className={`p-4 space-y-3 ${isSelected ? 'bg-red-50/40' : ''}`}
                        >
                          <div className="flex items-start gap-2.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectFile(f.fileUuid)}
                              className="w-4 h-4 mt-1 rounded border-slate-300 text-red-600 shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs sm:text-sm font-bold text-slate-900 break-all">
                                {f.originalName}
                              </p>
                              <div className="flex items-center gap-1.5 flex-wrap mt-1 text-[11px] text-slate-500">
                                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                                  {f.fileCategory} (.{f.fileExtension})
                                </span>
                                <span>{formatFileSize(f.fileSizeBytes)}</span>
                                <span>• {formatDateTimeThai(f.receivedAt)}</span>
                              </div>
                            </div>
                          </div>

                          {/* Recipient Selector */}
                          <div className="pl-6 space-y-1">
                            <label className="block text-[11px] font-semibold text-slate-600">
                              ผู้รับไฟล์ (Private / Public):
                            </label>
                            <select
                              value={
                                f.visibility === 'PRIVATE' && f.recipientUserIds
                                  ? f.recipientUserIds.split(',')[0].trim()
                                  : 'PUBLIC'
                              }
                              onChange={(e) => handleReassignFileRecipient(f, e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-700"
                            >
                              <option value="PUBLIC">🌐 Public (ทุกคนดูได้)</option>
                              {users.map((u) => (
                                <option key={u.userId} value={u.userId}>
                                  🔒 {u.userId} - {u.fullName}
                                  {u.lineAliases ? ` (${u.lineAliases})` : ''}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Comment Box */}
                          <div className="pl-6">
                            {editingCommentFileUuid === f.fileUuid ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={editingCommentText}
                                  onChange={(e) => setEditingCommentText(e.target.value)}
                                  placeholder="พิมพ์ข้อความฝาก..."
                                  className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveFileComment(f.fileUuid)}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                                >
                                  บันทึก
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingCommentFileUuid(null)}
                                  className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs"
                                >
                                  ยกเลิก
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-2 text-xs">
                                {f.attachedMessage ? (
                                  <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-slate-800 break-words">
                                    💬 {f.attachedMessage}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic">ไม่มีข้อความฝาก</span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCommentFileUuid(f.fileUuid);
                                    setEditingCommentText(f.attachedMessage || '');
                                  }}
                                  className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 text-[11px] shrink-0"
                                >
                                  แก้ไขข้อความ
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="pl-6 flex items-center gap-2 pt-1">
                            {canPreview && (
                              <button
                                type="button"
                                onClick={() => setAdminPreviewFile(f)}
                                className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-3 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700"
                              >
                                {f.fileCategory === 'VIDEO' ? (
                                  <>
                                    <Play className="w-3.5 h-3.5" />
                                    <span>เล่นวิดีโอ</span>
                                  </>
                                ) : (
                                  <>
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>เปิดดู</span>
                                  </>
                                )}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteFile(f)}
                              className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-3 rounded-xl bg-red-50 text-red-700 text-xs font-semibold"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>ลบไฟล์</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>

                {/* Desktop Table (>= md) */}
                <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <th className="py-3 pl-4 pr-2 w-10">
                        <input
                          type="checkbox"
                          aria-label="เลือกไฟล์ทั้งหมด"
                          checked={
                            adminFiles.length > 0 &&
                            selectedFileUuids.length === adminFiles.length
                          }
                          onChange={toggleSelectAllFiles}
                          className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500 cursor-pointer"
                        />
                      </th>
                      <th className="py-3 px-3">ชื่อไฟล์ต้นฉบับ / หมวดหมู่</th>
                      <th className="py-3 px-3">พื้นที่ / ผู้รับ (Private / Public)</th>
                      <th className="py-3 px-3">ข้อความที่ฝากถึงผู้รับ (Comment)</th>
                      <th className="py-3 px-3">ขนาด</th>
                      <th className="py-3 px-3">เวลาที่ได้รับ</th>
                      <th className="py-3 px-4 text-right">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {adminFiles
                      .filter(
                        (f) => adminCategoryFilter === 'ALL' || f.fileCategory === adminCategoryFilter
                      )
                      .map((f) => {
                        const isSelected = selectedFileUuids.includes(f.fileUuid);
                        const canPreview =
                          f.isPreviewable ||
                          ['PDF', 'IMAGE', 'VIDEO', 'AUDIO'].includes(f.fileCategory);
                        return (
                          <tr
                            key={f.fileUuid}
                            className={`transition ${
                              isSelected ? 'bg-red-50/50 hover:bg-red-50/80' : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="py-3 pl-4 pr-2">
                              <input
                                type="checkbox"
                                aria-label={`เลือกไฟล์ ${f.originalName}`}
                                checked={isSelected}
                                onChange={() => toggleSelectFile(f.fileUuid)}
                                className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500 cursor-pointer"
                              />
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold text-slate-900">{f.originalName}</p>
                                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-semibold">
                                  {f.fileCategory} (.{f.fileExtension})
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 font-mono">
                                UUID: {f.fileUuid}
                              </p>
                            </td>
                          <td className="py-3 px-3">
                            <div className="flex flex-col gap-1.5">
                              <div>
                                <span
                                  className={`px-2 py-0.5 rounded-md text-xs font-semibold ${f.visibility === 'PRIVATE'
                                    ? 'bg-indigo-100 text-indigo-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                    }`}
                                >
                                  {f.visibility}
                                </span>
                                {f.recipientUserIds && (
                                  <span className="text-xs text-slate-600 ml-1.5">
                                    ({f.recipientUserIds})
                                  </span>
                                )}
                              </div>
                              <select
                                aria-label={`กำหนดผู้รับไฟล์ ${f.originalName}`}
                                value={
                                  f.visibility === 'PRIVATE' && f.recipientUserIds
                                    ? f.recipientUserIds.split(',')[0].trim()
                                    : 'PUBLIC'
                                }
                                onChange={(e) => handleReassignFileRecipient(f, e.target.value)}
                                className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-xs text-slate-700 max-w-[210px]"
                              >
                                <option value="PUBLIC">🌐 Public (ทุกคนดูได้)</option>
                                {users.map((u) => (
                                  <option key={u.userId} value={u.userId}>
                                    🔒 {u.userId} - {u.fullName}
                                    {u.lineAliases ? ` (${u.lineAliases})` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-xs text-slate-700 max-w-xs">
                            {editingCommentFileUuid === f.fileUuid ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={editingCommentText}
                                  onChange={(e) => setEditingCommentText(e.target.value)}
                                  placeholder="พิมพ์ข้อความที่ฝาก (เว้นว่างเพื่อลบ)"
                                  className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs w-44"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveFileComment(f.fileUuid)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer"
                                >
                                  บันทึก
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCommentFileUuid(null);
                                    setEditingCommentText('');
                                  }}
                                  className="px-2 py-1 rounded-lg border border-slate-300 text-slate-600 text-xs cursor-pointer"
                                >
                                  ยกเลิก
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-2">
                                {f.attachedMessage ? (
                                  <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-slate-800">
                                    💬 {f.attachedMessage}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCommentFileUuid(f.fileUuid);
                                    setEditingCommentText(f.attachedMessage || '');
                                  }}
                                  className="px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 text-[11px] inline-flex items-center gap-1 shrink-0 cursor-pointer"
                                >
                                  <Edit3 className="w-3 h-3" /> แก้ไข
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 text-xs text-slate-600">
                            {formatFileSize(f.fileSizeBytes)}
                          </td>
                          <td className="py-3 px-3 text-xs text-slate-600 whitespace-nowrap">
                            {formatDateTimeThai(f.receivedAt)}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              {canPreview && (
                                <button
                                  type="button"
                                  onClick={() => setAdminPreviewFile(f)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-300 hover:bg-blue-50 hover:text-blue-700 text-slate-700 text-xs font-medium cursor-pointer"
                                >
                                  {f.fileCategory === 'VIDEO' ? (
                                    <>
                                      <Play className="w-3.5 h-3.5" />
                                      <span>เล่นวิดีโอ</span>
                                    </>
                                  ) : (
                                    <>
                                      <Eye className="w-3.5 h-3.5" />
                                      <span>เปิดดู</span>
                                    </>
                                  )}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteFile(f)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>ลบไฟล์</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
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
                            className={`px-2 py-0.5 rounded-md text-xs font-semibold ${bk.status === 'SUCCESS' || bk.status === 'RESTORED'
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
                            className={`px-2 py-0.5 rounded font-semibold ${w.processingStatus === 'SUCCESS'
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
                          className={`px-2 py-0.5 rounded font-semibold ${log.level === 'ERROR' || log.level === 'SECURITY'
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
                  ชื่อเรียกใน LINE (Aliases) สำหรับจับคู่ผู้รับไฟล์อัตโนมัติ
                </label>
                <input
                  type="text"
                  value={editLineAliases}
                  onChange={(e) => setEditLineAliases(e.target.value)}
                  placeholder="เช่น Opor, โอปอ (คั่นหลายชื่อด้วยเครื่องหมาย ,)"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  เวลาพิมพ์ชื่อนี้ใน LINE OA ก่อนส่งไฟล์ ระบบจะส่งไฟล์เข้าพื้นที่ส่วนตัวของผู้ใช้นี้ทันที
                </p>
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

      {/* Popup Alert Modal for Deleting Single / Selected / All Files */}
      {deleteConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-red-200 w-full max-w-lg p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-2xl bg-red-100 text-red-600 shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {deleteConfirmModal.mode === 'ALL'
                    ? `ยืนยันการลบไฟล์ทั้งหมดในระบบ (${deleteConfirmModal.files.length} รายการ)`
                    : `ยืนยันการลบไฟล์ที่เลือก (${deleteConfirmModal.files.length} รายการ)`}
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  ระบบจะทำการลบไฟล์จำนวน{' '}
                  <strong className="text-red-600 font-bold">
                    {deleteConfirmModal.files.length} รายการ
                  </strong>{' '}
                  ออกจากเครื่อง Server อย่างถาวร การดำเนินการนี้ไม่สามารถย้อนกลับได้
                </p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-xs font-bold text-red-900 mb-2">
                รายการไฟล์ที่จะถูกลบ ({deleteConfirmModal.files.length} รายการ):
              </p>
              <ul className="max-h-48 overflow-y-auto divide-y divide-red-200/60 text-xs text-slate-800">
                {deleteConfirmModal.files.map((item, idx) => (
                  <li key={item.fileUuid} className="py-1.5 flex items-center justify-between gap-2">
                    <span className="font-medium truncate">
                      {idx + 1}. {item.originalName}
                    </span>
                    <span className="text-[11px] text-slate-500 shrink-0">
                      {item.visibility} • {formatFileSize(item.fileSizeBytes)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={deletingFiles}
                onClick={() => setDeleteConfirmModal(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={deletingFiles}
                onClick={handleExecuteDeleteFiles}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>
                  {deletingFiles
                    ? 'กำลังลบไฟล์...'
                    : `ยืนยันลบ ${deleteConfirmModal.files.length} รายการ`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin File Preview Modal */}
      <FilePreviewModal file={adminPreviewFile} onClose={() => setAdminPreviewFile(null)} />
    </div>
  );
};

