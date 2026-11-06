import React, { useEffect, useState, useCallback } from 'react';
import {
  FolderDown,
  Bell,
  KeyRound,
  LogOut,
  ShieldCheck,
  LayoutDashboard,
} from 'lucide-react';
import {
  AuthUser,
  NotificationGroup,
  NotificationSubItem,
} from './types/index.js';
import { apiFetch, setCsrfToken } from './api/client.js';
import { LoginPage } from './components/LoginPage.js';
import { PasswordChangeModal } from './components/PasswordChangeModal.js';
import { NotificationInboxModal } from './components/NotificationInboxModal.js';
import { UserDashboard } from './components/UserDashboard.js';
import { AdminDashboard } from './components/AdminDashboard.js';

export const App: React.FC = () => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [currentView, setCurrentView] = useState<'FILES' | 'ADMIN'>('FILES');

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showInboxModal, setShowInboxModal] = useState(false);

  const [notificationGroups, setNotificationGroups] = useState<NotificationGroup[]>([]);
  const [unreadItemCount, setUnreadItemCount] = useState(0);
  const [highlightedItem, setHighlightedItem] = useState<NotificationSubItem | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await apiFetch<{
        unreadGroupCount: number;
        unreadItemCount: number;
        groups: NotificationGroup[];
      }>('/api/notifications');
      setNotificationGroups(data.groups);
      setUnreadItemCount(data.unreadItemCount);
    } catch {
      // Ignore if unauthenticated or mustChangePassword pending
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<{ user: AuthUser; csrfToken: string }>('/api/auth/me');
        setCsrfToken(data.csrfToken);
        setUser(data.user);
        if (data.user.role === 'ADMIN') {
          setCurrentView('ADMIN');
        }
      } catch {
        setUser(null);
      } finally {
        setInitializing(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (user && !user.mustChangePassword) {
      fetchNotifications();
      const timer = setInterval(fetchNotifications, 30000);
      return () => clearInterval(timer);
    }
  }, [user, fetchNotifications]);

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore logout error
    }
    setCsrfToken('');
    setUser(null);
    setShowPasswordModal(false);
    setShowInboxModal(false);
  };

  if (initializing) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 text-sm">
        กำลังโหลดระบบ...
      </div>
    );
  }

  if (!user) {
    return (
      <LoginPage
        onLoginSuccess={(loggedInUser) => {
          setUser(loggedInUser);
          setCurrentView(loggedInUser.role === 'ADMIN' ? 'ADMIN' : 'FILES');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <FolderDown className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-slate-900 text-sm sm:text-base truncate">
                ระบบรับฝากและดาวน์โหลดไฟล์ผ่าน LINE OA
              </h1>
              <p className="text-xs text-slate-500 truncate">
                ผู้ใช้งาน: <span className="font-semibold text-slate-700">{user.fullName}</span> (
                {user.userId})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {user.role === 'ADMIN' && (
              <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setCurrentView('ADMIN')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    currentView === 'ADMIN'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>จัดการระบบ (Admin)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentView('FILES')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    currentView === 'FILES'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4 text-indigo-600" />
                  <span>หน้าดูไฟล์</span>
                </button>
              </div>
            )}

            {/* Notification Inbox Button (REQ-17) */}
            <button
              type="button"
              onClick={() => {
                fetchNotifications();
                setShowInboxModal(true);
              }}
              className="relative p-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 cursor-pointer"
              title="กล่องแจ้งเตือน (Notification Inbox)"
            >
              <Bell className="w-5 h-5" />
              {unreadItemCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center">
                  {unreadItemCount > 99 ? '99+' : unreadItemCount}
                </span>
              )}
            </button>

            {/* Change Password Button */}
            <button
              type="button"
              onClick={() => setShowPasswordModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-medium cursor-pointer"
              title="เปลี่ยนรหัสผ่าน"
            >
              <KeyRound className="w-4 h-4" />
              <span className="hidden sm:inline">เปลี่ยนรหัสผ่าน</span>
            </button>

            {/* Logout Button */}
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">ออกจากระบบ</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {!user.mustChangePassword && (
          <>
            {currentView === 'ADMIN' && user.role === 'ADMIN' ? (
              <AdminDashboard />
            ) : (
              <UserDashboard
                highlightedItem={highlightedItem}
                onClearHighlightedItem={() => setHighlightedItem(null)}
              />
            )}
          </>
        )}
      </main>

      {/* Force Change Password on First Login OR Manual Password Change (REQ-06) */}
      {(user.mustChangePassword || showPasswordModal) && (
        <PasswordChangeModal
          userId={user.userId}
          isForced={user.mustChangePassword}
          onSuccess={() => {
            setUser({ ...user, mustChangePassword: false });
            setShowPasswordModal(false);
          }}
          onClose={() => setShowPasswordModal(false)}
          onLogout={handleLogout}
        />
      )}

      {/* Notification Inbox Modal (REQ-17, REQ-18) */}
      <NotificationInboxModal
        isOpen={showInboxModal}
        groups={notificationGroups}
        unreadItemCount={unreadItemCount}
        onClose={() => setShowInboxModal(false)}
        onRefresh={fetchNotifications}
        onNavigateToItem={(item) => {
          setShowInboxModal(false);
          setCurrentView('FILES');
          setHighlightedItem(item);
        }}
      />
    </div>
  );
};

