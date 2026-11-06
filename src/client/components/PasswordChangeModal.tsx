import React, { useState } from 'react';
import { KeyRound, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { apiFetch } from '../api/client.js';

interface PasswordChangeModalProps {
  userId: string;
  isForced: boolean;
  onSuccess: () => void;
  onClose?: () => void;
  onLogout?: () => void;
}

export const PasswordChangeModal: React.FC<PasswordChangeModalProps> = ({
  userId,
  isForced,
  onSuccess,
  onClose,
  onLogout,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (newPassword.length < 6) {
      setError('รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
      return;
    }
    if (newPassword === userId) {
      setError('รหัสผ่านใหม่ต้องไม่ซ้ำกับ User ID ของคุณ');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }

    setLoading(true);
    try {
      await apiFetch<{ ok: boolean; message: string }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setSuccessMsg('เปลี่ยนรหัสผ่านสำเร็จเรียบร้อยแล้ว');
      setTimeout(() => {
        onSuccess();
      }, 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {isForced ? 'กำหนดรหัสผ่านใหม่ในการเข้าใช้งานครั้งแรก' : 'เปลี่ยนรหัสผ่าน'}
              </h2>
              <p className="text-xs text-slate-500">บัญชีผู้ใช้งาน: {userId}</p>
            </div>
          </div>
          {!isForced && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {isForced && (
          <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
            เพื่อความปลอดภัยของไฟล์ส่วนตัว ระบบกำหนดให้ต้องเปลี่ยนรหัสผ่านเริ่มต้นก่อนเข้าถึงข้อมูล
            (ห้ามตั้งรหัสผ่านซ้ำกับ User ID)
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-emerald-700 text-sm">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              รหัสผ่านปัจจุบัน
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="กรอกรหัสผ่านปัจจุบัน"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร และไม่ซ้ำ User ID)
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="กรอกรหัสผ่านใหม่"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              ยืนยันรหัสผ่านใหม่
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            {isForced && onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm hover:bg-slate-100 cursor-pointer"
              >
                ออกจากระบบ
              </button>
            )}
            {!isForced && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm hover:bg-slate-100 cursor-pointer"
              >
                ยกเลิก
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-semibold rounded-xl text-sm cursor-pointer"
            >
              {loading ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

