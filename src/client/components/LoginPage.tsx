import React, { useState } from 'react';
import { Lock, User, FolderDown, AlertCircle } from 'lucide-react';
import { apiFetch, setCsrfToken } from '../api/client.js';
import { AuthUser } from '../types/index.js';

interface LoginPageProps {
  onLoginSuccess: (user: AuthUser) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch<{ user: AuthUser; csrfToken: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ userId: userId.trim(), password }),
      });
      setCsrfToken(data.csrfToken);
      onLoginSuccess(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 bg-emerald-600 text-white rounded-2xl flex items-center justify-center shadow-sm mb-3">
            <FolderDown className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            ระบบรับฝากและดาวน์โหลดไฟล์ผ่าน LINE OA
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            กรุณาเข้าสู่ระบบด้วยรหัสผู้ใช้งาน (User ID) และรหัสผ่านของคุณ
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-red-700 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="login-userid"
              className="block text-sm font-medium text-slate-700 mb-1.5"
            >
              รหัสผู้ใช้งาน (User ID)
            </label>
            <div className="relative">
              <User className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="login-userid"
                type="text"
                required
                autoComplete="username"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="เช่น 6501001"
                className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="block text-sm font-medium text-slate-700 mb-1.5"
            >
              รหัสผ่าน (Password)
            </label>
            <div className="relative">
              <Lock className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="กรอกรหัสผ่าน"
                className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-semibold rounded-xl shadow-sm transition cursor-pointer"
          >
            {loading ? 'กำลังตรวจสอบข้อมูล...' : 'เข้าสู่ระบบ (Login)'}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-100 text-xs text-slate-500 space-y-1">
          <p>• สำหรับการเข้าใช้งานครั้งแรก รหัสผ่านเริ่มต้นคือรหัสเดียวกับ User ID ของคุณ</p>
          <p>• ระบบจะบังคับให้ตั้งรหัสผ่านใหม่เมื่อเข้าสู่ระบบครั้งแรกเพื่อความปลอดภัย</p>
        </div>
      </div>
    </div>
  );
};

