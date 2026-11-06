import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Bell,
  KeyRound,
  LogOut,
  ShieldCheck,
  HardDrive,
  Search,
  X,
  SlidersHorizontal,
  Sparkles,
  CheckCircle2,
  Eye,
  ExternalLink,
  FolderLock,
  Globe,
  Radio,
  Monitor,
  Sun,
  Moon,
  Menu,
  Users,
  Link as LinkIcon,
  FileText,
  Film,
  Image as ImageIcon,
  Music,
  Archive,
  File,
  Activity,
} from 'lucide-react';
import {
  AuthUser,
  DashboardSummary,
  NotificationGroup,
  NotificationSubItem,
} from './types/index.js';
import { apiFetch, formatFileSize, setCsrfToken } from './api/client.js';
import { LoginPage } from './components/LoginPage.js';
import { PasswordChangeModal } from './components/PasswordChangeModal.js';
import { NotificationInboxModal } from './components/NotificationInboxModal.js';
import {
  UserDashboard,
  DriveTabKey,
  CategoryKey,
  CATEGORY_DEFINITIONS,
} from './components/UserDashboard.js';
import { AdminDashboard, AdminSubTabKey } from './components/AdminDashboard.js';

export type ThemeMode = 'SYSTEM' | 'LIGHT' | 'DARK';

interface RealtimeToastItem {
  id: string;
  type: 'FILE_RECEIVED' | 'URL_RECEIVED' | 'FILE_UPDATED' | 'FILE_DELETED';
  itemUuid?: string;
  title: string;
  fileCategory?: string;
  fileSizeBytes?: number | null;
  visibility: 'PRIVATE' | 'PUBLIC';
  attachedMessage?: string | null;
  timestamp?: string;
}

/**
 * Play a gentle Google-style notification chime using Web Audio API
 */
function playNotificationChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(659.25, now);
    osc1.frequency.setValueAtTime(880, now + 0.11);
    osc2.frequency.setValueAtTime(659.25, now);
    osc2.frequency.setValueAtTime(880, now + 0.11);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.4);
    osc2.stop(now + 0.4);
  } catch {
    // Ignore if browser blocks audio before user interaction
  }
}

export const App: React.FC = () => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [currentView, setCurrentView] = useState<'FILES' | 'ADMIN'>('FILES');

  // Shared Navigation State for Hamburger Drawer & Bottom Nav Bar
  const [driveTab, setDriveTab] = useState<DriveTabKey>('ALL');
  const [driveCategory, setDriveCategory] = useState<CategoryKey>('ALL');
  const [adminSubTab, setAdminSubTab] = useState<AdminSubTabKey>('USERS');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [driveSummary, setDriveSummary] = useState<DashboardSummary>({
    privateCount: 0,
    publicCount: 0,
    totalFilesCount: 0,
    urlCount: 0,
  });

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showInboxModal, setShowInboxModal] = useState(false);

  const [notificationGroups, setNotificationGroups] = useState<NotificationGroup[]>([]);
  const [unreadItemCount, setUnreadItemCount] = useState(0);
  const [highlightedItem, setHighlightedItem] = useState<NotificationSubItem | null>(null);

  // Global Google Drive Search Query in Top Bar
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');

  // Device / System Theme State ('SYSTEM' | 'LIGHT' | 'DARK')
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('drive_theme_mode');
      if (saved === 'LIGHT' || saved === 'DARK' || saved === 'SYSTEM') {
        return saved;
      }
    } catch {
      // Ignore storage access errors
    }
    return 'SYSTEM';
  });

  // Apply theme & listen to OS/Device prefers-color-scheme in real time
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const isDark =
        themeMode === 'DARK' || (themeMode === 'SYSTEM' && mediaQuery.matches);
      const root = document.documentElement;
      if (isDark) {
        root.classList.add('dark');
        root.style.colorScheme = 'dark';
      } else {
        root.classList.remove('dark');
        root.style.colorScheme = 'light';
      }
    };

    applyTheme();
    try {
      localStorage.setItem('drive_theme_mode', themeMode);
    } catch {
      // Ignore storage error
    }

    const handleSystemThemeChange = () => {
      if (themeMode === 'SYSTEM') {
        applyTheme();
      }
    };

    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
    };
  }, [themeMode]);

  const cycleThemeMode = () => {
    setThemeMode((prev) =>
      prev === 'SYSTEM' ? 'DARK' : prev === 'DARK' ? 'LIGHT' : 'SYSTEM'
    );
  };

  // Real-time trigger counter & live toast alerts
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [sseConnected, setSseConnected] = useState(false);
  const [toasts, setToasts] = useState<RealtimeToastItem[]>([]);
  const knownLatestNotifUuidRef = useRef<string | null>(null);

  const pushToast = useCallback((toast: RealtimeToastItem) => {
    setToasts((prev) => [toast, ...prev].slice(0, 4));
    playNotificationChime();
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toast.id));
    }, 9000);
  }, []);

  const fetchNotifications = useCallback(
    async (checkNewForFallbackToast = false) => {
      try {
        const data = await apiFetch<{
          unreadGroupCount: number;
          unreadItemCount: number;
          groups: NotificationGroup[];
        }>('/api/notifications');
        setNotificationGroups(data.groups);
        setUnreadItemCount(data.unreadItemCount);

        const latestSubItem = data.groups[0]?.items?.[0];
        if (latestSubItem) {
          if (
            checkNewForFallbackToast &&
            knownLatestNotifUuidRef.current !== null &&
            latestSubItem.notificationUuid !== knownLatestNotifUuidRef.current
          ) {
            setRefreshTrigger((c) => c + 1);
          }
          knownLatestNotifUuidRef.current = latestSubItem.notificationUuid;
        }
      } catch {
        // Ignore if unauthenticated or mustChangePassword pending
      }
    },
    []
  );

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<{ user: AuthUser; csrfToken: string }>('/api/auth/me');
        setCsrfToken(data.csrfToken);
        setUser(data.user);
        if (data.user.role === 'ADMIN') {
          setCurrentView('FILES');
        }
      } catch {
        setUser(null);
      } finally {
        setInitializing(false);
      }
    })();
  }, []);

  // Real-Time Server-Sent Events (SSE) subscription + fast 5-second fallback poll
  useEffect(() => {
    if (!user || user.mustChangePassword) return;

    fetchNotifications(false);

    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/notifications/stream', { withCredentials: true });

      es.onopen = () => {
        setSseConnected(true);
      };

      es.onmessage = (evt: MessageEvent) => {
        try {
          const payload = JSON.parse(evt.data) as Omit<RealtimeToastItem, 'id'>;
          setRefreshTrigger((c) => c + 1);
          fetchNotifications(false);

          if (
            payload.type === 'FILE_RECEIVED' ||
            payload.type === 'URL_RECEIVED' ||
            payload.type === 'FILE_UPDATED'
          ) {
            pushToast({
              ...payload,
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            });
          }
        } catch {
          // Ignore malformed event
        }
      };

      es.onerror = () => {
        setSseConnected(false);
      };
    } catch {
      setSseConnected(false);
    }

    const pollTimer = setInterval(() => {
      fetchNotifications(true);
    }, 5000);

    return () => {
      clearInterval(pollTimer);
      if (es) {
        es.close();
      }
    };
  }, [user, fetchNotifications, pushToast]);

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
    setMobileMenuOpen(false);
  };

  const renderDrawerCategoryIcon = (cat: CategoryKey) => {
    switch (cat) {
      case 'PDF':
        return <FileText className="w-4 h-4 text-[#EA4335]" />;
      case 'VIDEO':
        return <Film className="w-4 h-4 text-rose-500" />;
      case 'IMAGE':
        return <ImageIcon className="w-4 h-4 text-purple-500" />;
      case 'DOCUMENT':
        return <FileText className="w-4 h-4 text-[#0B57D0] dark:text-[#A8C7FA]" />;
      case 'AUDIO':
        return <Music className="w-4 h-4 text-cyan-500" />;
      case 'ARCHIVE':
        return <Archive className="w-4 h-4 text-amber-500" />;
      default:
        return <File className="w-4 h-4 text-[#444746] dark:text-[#C4C7C5]" />;
    }
  };

  if (initializing) {
    return (
      <div className="min-h-screen bg-[#F8FAFD] dark:bg-[#1B1B1B] flex items-center justify-center text-slate-600 dark:text-[#C4C7C5] text-sm font-medium">
        กำลังโหลด Google Drive Workspace...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="relative">
        <div className="fixed top-4 right-4 z-40">
          <button
            type="button"
            onClick={cycleThemeMode}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-[#282A2C] border border-slate-200 dark:border-[#3C4043] text-xs font-semibold text-[#444746] dark:text-[#E3E3E3] shadow-xs cursor-pointer"
            title="สลับโหมดสี: ตามเครื่อง (System) / มืด (Dark) / สว่าง (Light)"
          >
            {themeMode === 'SYSTEM' ? (
              <>
                <Monitor className="w-3.5 h-3.5 text-[#0B57D0] dark:text-[#A8C7FA]" />
                <span>ธีม: ตามเครื่อง</span>
              </>
            ) : themeMode === 'DARK' ? (
              <>
                <Moon className="w-3.5 h-3.5 text-amber-400" />
                <span>ธีม: โหมดมืด</span>
              </>
            ) : (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-500" />
                <span>ธีม: โหมดสว่าง</span>
              </>
            )}
          </button>
        </div>

        <LoginPage
          onLoginSuccess={(loggedInUser) => {
            setUser(loggedInUser);
            setCurrentView('FILES');
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFD] dark:bg-[#1B1B1B] text-[#1F1F1F] dark:text-[#E3E3E3] flex flex-col transition-colors duration-200">
      {/* =====================================================================
          RESPONSIVE GOOGLE DRIVE TOP HEADER BAR
          Row 1: Hamburger (Portrait/Mobile) + Logo + Desktop Search + Actions
          Row 2 (Portrait/Mobile < md): Full-width Search Bar
      ===================================================================== */}
      <header className="bg-[#F8FAFD] dark:bg-[#1B1B1B] sticky top-0 z-30 border-b border-slate-200/60 dark:border-[#3C4043]/60 lg:border-b-0 select-none transition-colors duration-200">
        <div className="h-14 sm:h-16 px-2.5 sm:px-5 flex items-center justify-between gap-2 sm:gap-3">
          {/* Left: Hamburger Button (Mobile/Portrait < lg) + Google Drive Logo */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 lg:w-60 shrink-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="เปิดเมนูนำทาง (Hamburger Menu)"
              className="lg:hidden p-2 rounded-full hover:bg-[#E9EEF6] dark:hover:bg-[#282A2C] text-[#444746] dark:text-[#E3E3E3] transition cursor-pointer"
            >
              <Menu className="w-6 h-6" />
            </button>

            <div
              onClick={() => {
                setCurrentView('FILES');
                setDriveTab('ALL');
              }}
              className="flex items-center gap-2 min-w-0 cursor-pointer group"
            >
              {/* Google Drive 4-color emblem */}
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white dark:bg-[#282A2C] shadow-xs border border-slate-200/80 dark:border-[#3C4043] flex items-center justify-center shrink-0 group-hover:shadow-sm transition">
                <svg viewBox="0 0 87.3 78" className="w-5 h-5 sm:w-6 sm:h-6">
                  <path
                    d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z"
                    fill="#0066da"
                  />
                  <path
                    d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z"
                    fill="#00ac47"
                  />
                  <path
                    d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z"
                    fill="#ea4335"
                  />
                  <path
                    d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z"
                    fill="#00832d"
                  />
                  <path
                    d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"
                    fill="#2684fc"
                  />
                  <path
                    d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z"
                    fill="#ffba00"
                  />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-lg sm:text-[20px] font-semibold tracking-tight text-[#444746] dark:text-[#E3E3E3] leading-none">
                    Drive
                  </span>
                  <span className="px-1.5 py-0.5 rounded-full bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF] text-[10px] font-bold">
                    LINE OA
                  </span>
                </div>
                <p className="hidden sm:block text-[11px] text-[#5F6368] dark:text-[#C4C7C5] truncate mt-0.5">
                  ระบบจัดเก็บและดาวน์โหลดไฟล์อัตโนมัติ
                </p>
              </div>
            </div>
          </div>

          {/* Center (Desktop & Tablet >= md): Google Drive Pill Search Bar */}
          <div className="hidden md:block flex-1 max-w-2xl">
            <div className="relative flex items-center w-full h-11 rounded-full bg-[#E9EEF6] dark:bg-[#282A2C] hover:bg-[#E2E7EF] dark:hover:bg-[#333537] focus-within:bg-white dark:focus-within:bg-[#1E1F20] focus-within:shadow-md border border-transparent focus-within:border-slate-200 dark:focus-within:border-[#3C4043] transition-all px-4">
              <Search className="w-5 h-5 text-[#444746] dark:text-[#C4C7C5] shrink-0 mr-3" />
              <input
                type="text"
                value={globalSearchQuery}
                onChange={(e) => {
                  setGlobalSearchQuery(e.target.value);
                  if (currentView !== 'FILES') {
                    setCurrentView('FILES');
                  }
                }}
                placeholder="ค้นหาในไดรฟ์ (ชื่อไฟล์, นามสกุลไฟล์, หรือข้อความ Comment)..."
                className="w-full bg-transparent text-sm text-[#1F1F1F] dark:text-[#E3E3E3] placeholder-[#444746] dark:placeholder-[#8E918F] focus:outline-none"
              />
              {globalSearchQuery && (
                <button
                  type="button"
                  onClick={() => setGlobalSearchQuery('')}
                  className="p-1.5 rounded-full hover:bg-slate-200/70 dark:hover:bg-[#3C4043] text-[#444746] dark:text-[#C4C7C5] cursor-pointer"
                  title="ล้างคำค้นหา"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <div className="flex items-center pl-2 ml-1 border-l border-slate-300/80 dark:border-[#444746] text-[#444746] dark:text-[#C4C7C5]">
                <SlidersHorizontal className="w-4 h-4 opacity-70" />
              </div>
            </div>
          </div>

          {/* Right: Compact Actions (Fits Portrait Screens Cleanly) */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Live Real-Time Sync Indicator */}
            <div
              className={`hidden xl:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                sseConnected
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70'
                  : 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/70'
              }`}
              title="ระบบเชื่อมต่อสัญญาณแจ้งเตือนและอัปเดตไฟล์อัตโนมัติแบบ Real-Time"
            >
              <span className="relative flex h-2 w-2">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    sseConnected ? 'bg-emerald-500' : 'bg-blue-500'
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    sseConnected ? 'bg-emerald-600' : 'bg-blue-600'
                  }`}
                />
              </span>
              <Radio className="w-3.5 h-3.5" />
              <span>Real-Time</span>
            </div>

            {/* Device / System Theme Switcher Button */}
            <button
              type="button"
              onClick={cycleThemeMode}
              className="inline-flex items-center gap-1.5 p-2 sm:px-2.5 sm:py-2 rounded-full bg-[#E9EEF6] dark:bg-[#282A2C] hover:bg-[#E2E7EF] dark:hover:bg-[#333537] text-[#444746] dark:text-[#E3E3E3] text-xs font-semibold transition cursor-pointer"
              title={
                themeMode === 'SYSTEM'
                  ? 'โหมดสี: ตามเครื่อง (คลิกเพื่อสลับ)'
                  : themeMode === 'DARK'
                  ? 'โหมดสี: โหมดมืด (คลิกเพื่อสลับ)'
                  : 'โหมดสี: โหมดสว่าง (คลิกเพื่อสลับ)'
              }
            >
              {themeMode === 'SYSTEM' ? (
                <>
                  <Monitor className="w-4 h-4 text-[#0B57D0] dark:text-[#A8C7FA]" />
                  <span className="hidden lg:inline">ตามเครื่อง</span>
                </>
              ) : themeMode === 'DARK' ? (
                <>
                  <Moon className="w-4 h-4 text-amber-400" />
                  <span className="hidden lg:inline">มืด</span>
                </>
              ) : (
                <>
                  <Sun className="w-4 h-4 text-amber-500" />
                  <span className="hidden lg:inline">สว่าง</span>
                </>
              )}
            </button>

            {/* Admin / Drive Switcher (Desktop/Tablet Pill) */}
            {user.role === 'ADMIN' && (
              <div className="hidden sm:flex items-center bg-[#E9EEF6] dark:bg-[#282A2C] p-1 rounded-full">
                <button
                  type="button"
                  onClick={() => setCurrentView('FILES')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer ${
                    currentView === 'FILES'
                      ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF] shadow-2xs'
                      : 'text-[#444746] dark:text-[#C4C7C5] hover:text-[#1F1F1F] dark:hover:text-white'
                  }`}
                >
                  <HardDrive className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">หน้าไดรฟ์</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentView('ADMIN')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer ${
                    currentView === 'ADMIN'
                      ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF] shadow-2xs'
                      : 'text-[#444746] dark:text-[#C4C7C5] hover:text-[#1F1F1F] dark:hover:text-white'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">แอดมิน</span>
                </button>
              </div>
            )}

            {/* Notification Inbox Button (REQ-17) */}
            <button
              type="button"
              onClick={() => {
                fetchNotifications(false);
                setShowInboxModal(true);
              }}
              className="relative p-2 rounded-full hover:bg-[#E9EEF6] dark:hover:bg-[#282A2C] text-[#444746] dark:text-[#C4C7C5] transition cursor-pointer"
              title="กล่องแจ้งเตือน (Notification Inbox)"
            >
              <Bell className="w-5 h-5" />
              {unreadItemCount > 0 && (
                <span className="absolute top-0 right-0 min-w-4.5 h-4.5 px-1 rounded-full bg-[#B3261E] text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
                  {unreadItemCount > 99 ? '99+' : unreadItemCount}
                </span>
              )}
            </button>

            {/* Change Password Button (Desktop) */}
            <button
              type="button"
              onClick={() => setShowPasswordModal(true)}
              className="hidden sm:inline-flex p-2 rounded-full hover:bg-[#E9EEF6] dark:hover:bg-[#282A2C] text-[#444746] dark:text-[#C4C7C5] transition cursor-pointer"
              title="เปลี่ยนรหัสผ่าน"
            >
              <KeyRound className="w-5 h-5" />
            </button>

            {/* User Profile Pill / Avatar (Tapping on mobile opens Hamburger Drawer) */}
            <div className="flex items-center gap-1.5 pl-1.5 pr-1 py-1 rounded-full bg-white dark:bg-[#282A2C] border border-slate-200/90 dark:border-[#3C4043] shadow-2xs">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="w-7 h-7 rounded-full bg-[#0B57D0] text-white text-xs font-bold flex items-center justify-center uppercase shrink-0 cursor-pointer"
                title={`${user.fullName} (${user.userId})`}
              >
                {user.fullName.slice(0, 1)}
              </button>
              <div className="hidden md:block text-left pr-1 max-w-[120px]">
                <p className="text-xs font-semibold text-[#1F1F1F] dark:text-[#E3E3E3] truncate leading-tight">
                  {user.fullName}
                </p>
                <p className="text-[10px] text-[#5F6368] dark:text-[#C4C7C5] truncate leading-tight">
                  {user.userId}
                </p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="p-1.5 rounded-full hover:bg-red-50 dark:hover:bg-red-950/50 text-slate-500 dark:text-[#C4C7C5] hover:text-red-600 transition cursor-pointer"
                title="ออกจากระบบ"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Row 2 (Portrait / Mobile < md): Full-Width Google Drive Search Bar */}
        <div className="md:hidden px-3 pb-2.5">
          <div className="relative flex items-center w-full h-10 rounded-full bg-[#E9EEF6] dark:bg-[#282A2C] focus-within:bg-white dark:focus-within:bg-[#1E1F20] border border-transparent focus-within:border-slate-300 dark:focus-within:border-[#3C4043] px-3.5">
            <Search className="w-4 h-4 text-[#444746] dark:text-[#C4C7C5] shrink-0 mr-2.5" />
            <input
              type="text"
              value={globalSearchQuery}
              onChange={(e) => {
                setGlobalSearchQuery(e.target.value);
                if (currentView !== 'FILES') {
                  setCurrentView('FILES');
                }
              }}
              placeholder="ค้นหาชื่อไฟล์ หรือข้อความ Comment ในไดรฟ์..."
              className="w-full bg-transparent text-xs text-[#1F1F1F] dark:text-[#E3E3E3] placeholder-[#444746] dark:placeholder-[#8E918F] focus:outline-none"
            />
            {globalSearchQuery && (
              <button
                type="button"
                onClick={() => setGlobalSearchQuery('')}
                className="p-1 rounded-full text-[#444746] dark:text-[#C4C7C5]"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* =====================================================================
          HAMBURGER SLIDE-OVER NAVIGATION DRAWER (PORTRAIT & MOBILE < lg)
      ===================================================================== */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop */}
          <div
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
          />

          {/* Slide-over Drawer Panel */}
          <div className="relative w-80 max-w-[85vw] bg-[#F8FAFD] dark:bg-[#1E1F20] h-full shadow-2xl flex flex-col justify-between overflow-y-auto z-10 border-r border-slate-200 dark:border-[#3C4043]">
            <div className="p-4 space-y-4">
              {/* Drawer Header: User Profile + Close Button */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#3C4043]">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#0B57D0] text-white font-bold text-sm flex items-center justify-center uppercase shrink-0">
                    {user.fullName.slice(0, 1)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#1F1F1F] dark:text-[#E3E3E3] truncate">
                      {user.fullName}
                    </p>
                    <p className="text-xs text-[#5F6368] dark:text-[#C4C7C5] truncate">
                      รหัสผู้ใช้: {user.userId} ({user.role})
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 rounded-full hover:bg-slate-200/70 dark:hover:bg-[#333537] text-[#444746] dark:text-[#C4C7C5]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Real-Time Status Badge */}
              <div className="flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#282A2C] border border-slate-200/90 dark:border-[#3C4043]">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  <Radio className="w-4 h-4 animate-pulse" />
                  <span>รับไฟล์จาก LINE OA อัตโนมัติ</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                  Real-Time
                </span>
              </div>

              {/* Section 1: Drive Folders Navigation */}
              <div className="space-y-1">
                <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-[#5F6368] dark:text-[#8E918F]">
                  พื้นที่จัดเก็บไฟล์ (Google Drive)
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setCurrentView('FILES');
                    setDriveTab('ALL');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-2.5 rounded-full text-xs font-semibold transition ${
                    currentView === 'FILES' && driveTab === 'ALL'
                      ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF] font-bold'
                      : 'text-[#444746] dark:text-[#C4C7C5] hover:bg-[#E8EAED] dark:hover:bg-[#282A2C]'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <HardDrive className="w-4 h-4" />
                    <span>ไดรฟ์ของฉัน (ไฟล์ทั้งหมด)</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-white/80 dark:bg-[#131314] text-[11px] font-bold">
                    {driveSummary.totalFilesCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCurrentView('FILES');
                    setDriveTab('PRIVATE');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-2.5 rounded-full text-xs font-semibold transition ${
                    currentView === 'FILES' && driveTab === 'PRIVATE'
                      ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF] font-bold'
                      : 'text-[#444746] dark:text-[#C4C7C5] hover:bg-[#E8EAED] dark:hover:bg-[#282A2C]'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Users className="w-4 h-4" />
                    <span>แชร์กับฉัน (Private)</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-white/80 dark:bg-[#131314] text-[11px] font-bold">
                    {driveSummary.privateCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCurrentView('FILES');
                    setDriveTab('PUBLIC');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-2.5 rounded-full text-xs font-semibold transition ${
                    currentView === 'FILES' && driveTab === 'PUBLIC'
                      ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF] font-bold'
                      : 'text-[#444746] dark:text-[#C4C7C5] hover:bg-[#E8EAED] dark:hover:bg-[#282A2C]'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Globe className="w-4 h-4" />
                    <span>ไดรฟ์ส่วนกลาง (Public)</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-white/80 dark:bg-[#131314] text-[11px] font-bold">
                    {driveSummary.publicCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCurrentView('FILES');
                    setDriveTab('URLS');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-2.5 rounded-full text-xs font-semibold transition ${
                    currentView === 'FILES' && driveTab === 'URLS'
                      ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF] font-bold'
                      : 'text-[#444746] dark:text-[#C4C7C5] hover:bg-[#E8EAED] dark:hover:bg-[#282A2C]'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <LinkIcon className="w-4 h-4" />
                    <span>ลิงก์ที่แชร์ (URLs)</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-white/80 dark:bg-[#131314] text-[11px] font-bold">
                    {driveSummary.urlCount}
                  </span>
                </button>
              </div>

              {/* Section 2: File Categories in Hamburger Drawer */}
              <div className="pt-2 border-t border-slate-200 dark:border-[#3C4043] space-y-1">
                <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-[#5F6368] dark:text-[#8E918F]">
                  แยกตามหมวดหมู่ไฟล์ (Categories)
                </p>
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentView('FILES');
                      if (driveTab === 'URLS') setDriveTab('ALL');
                      setDriveCategory('ALL');
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition ${
                      currentView === 'FILES' && driveCategory === 'ALL'
                        ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF]'
                        : 'bg-white dark:bg-[#282A2C] text-[#444746] dark:text-[#C4C7C5]'
                    }`}
                  >
                    <HardDrive className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">ทุกหมวดหมู่</span>
                  </button>

                  {CATEGORY_DEFINITIONS.map((cat) => (
                    <button
                      key={`drawer-cat-${cat.key}`}
                      type="button"
                      onClick={() => {
                        setCurrentView('FILES');
                        if (driveTab === 'URLS') setDriveTab('ALL');
                        setDriveCategory(cat.key);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition ${
                        currentView === 'FILES' && driveCategory === cat.key
                          ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF]'
                          : 'bg-white dark:bg-[#282A2C] text-[#444746] dark:text-[#C4C7C5]'
                      }`}
                    >
                      {renderDrawerCategoryIcon(cat.key)}
                      <span className="truncate">{cat.shortLabel}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Section 3: Admin Management (If User is ADMIN) */}
              {user.role === 'ADMIN' && (
                <div className="pt-2 border-t border-slate-200 dark:border-[#3C4043] space-y-1">
                  <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-[#5F6368] dark:text-[#8E918F]">
                    จัดการระบบ (Admin Control)
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentView('ADMIN');
                      setAdminSubTab('USERS');
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-full text-xs font-semibold transition ${
                      currentView === 'ADMIN' && adminSubTab === 'USERS'
                        ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF] font-bold'
                        : 'text-[#444746] dark:text-[#C4C7C5] hover:bg-[#E8EAED] dark:hover:bg-[#282A2C]'
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    <span>จัดการบัญชีผู้ใช้งาน & ชื่อ LINE</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCurrentView('ADMIN');
                      setAdminSubTab('FILES');
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-full text-xs font-semibold transition ${
                      currentView === 'ADMIN' && adminSubTab === 'FILES'
                        ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF] font-bold'
                        : 'text-[#444746] dark:text-[#C4C7C5] hover:bg-[#E8EAED] dark:hover:bg-[#282A2C]'
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    <span>ควบคุมและลบไฟล์ในระบบ</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCurrentView('ADMIN');
                      setAdminSubTab('STATUS');
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-full text-xs font-semibold transition ${
                      currentView === 'ADMIN' && adminSubTab === 'STATUS'
                        ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF] font-bold'
                        : 'text-[#444746] dark:text-[#C4C7C5] hover:bg-[#E8EAED] dark:hover:bg-[#282A2C]'
                    }`}
                  >
                    <HardDrive className="w-4 h-4" />
                    <span>สถานะระบบ & สำรองข้อมูล (Backup)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCurrentView('ADMIN');
                      setAdminSubTab('LOGS');
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-full text-xs font-semibold transition ${
                      currentView === 'ADMIN' && adminSubTab === 'LOGS'
                        ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF] font-bold'
                        : 'text-[#444746] dark:text-[#C4C7C5] hover:bg-[#E8EAED] dark:hover:bg-[#282A2C]'
                    }`}
                  >
                    <Activity className="w-4 h-4" />
                    <span>บันทึกการทำงาน (Webhook Logs)</span>
                  </button>
                </div>
              )}
            </div>

            {/* Drawer Footer: Theme, Notifications, Password, Logout */}
            <div className="p-4 border-t border-slate-200 dark:border-[#3C4043] space-y-2 bg-white/60 dark:bg-[#131314]/60">
              <button
                type="button"
                onClick={cycleThemeMode}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#E9EEF6] dark:bg-[#282A2C] text-xs font-semibold text-[#1F1F1F] dark:text-[#E3E3E3]"
              >
                <span className="flex items-center gap-2.5">
                  {themeMode === 'SYSTEM' ? (
                    <Monitor className="w-4 h-4 text-[#0B57D0] dark:text-[#A8C7FA]" />
                  ) : themeMode === 'DARK' ? (
                    <Moon className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Sun className="w-4 h-4 text-amber-500" />
                  )}
                  <span>โหมดธีมสีหน้าเว็บ</span>
                </span>
                <span className="px-2 py-0.5 rounded-md bg-white dark:bg-[#131314] text-[11px] font-bold">
                  {themeMode === 'SYSTEM'
                    ? 'ตามเครื่อง'
                    : themeMode === 'DARK'
                    ? 'โหมดมืด'
                    : 'โหมดสว่าง'}
                </span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setShowPasswordModal(true);
                  }}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-slate-300 dark:border-[#3C4043] text-xs font-semibold text-[#444746] dark:text-[#C4C7C5]"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>เปลี่ยนรหัสผ่าน</span>
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-red-600 text-white text-xs font-semibold"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>ออกจากระบบ</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MAIN CONTENT WORKSPACE (pb-24 on portrait/mobile for Bottom Nav Bar)
      ===================================================================== */}
      <main className="flex-1 w-full px-2 sm:px-4 pt-2 pb-24 lg:pb-6">
        {!user.mustChangePassword && (
          <>
            {currentView === 'ADMIN' && user.role === 'ADMIN' ? (
              <div className="max-w-7xl mx-auto">
                <AdminDashboard
                  refreshTrigger={refreshTrigger}
                  activeSubTab={adminSubTab}
                  onSubTabChange={setAdminSubTab}
                />
              </div>
            ) : (
              <UserDashboard
                highlightedItem={highlightedItem}
                onClearHighlightedItem={() => setHighlightedItem(null)}
                externalSearchQuery={globalSearchQuery}
                onExternalSearchChange={setGlobalSearchQuery}
                refreshTrigger={refreshTrigger}
                activeTab={driveTab}
                onActiveTabChange={setDriveTab}
                categoryFilter={driveCategory}
                onCategoryFilterChange={setDriveCategory}
                onSummaryUpdate={setDriveSummary}
              />
            )}
          </>
        )}
      </main>

      {/* =====================================================================
          FIXED BOTTOM NAVIGATION BAR (PORTRAIT & MOBILE < lg)
          Google Drive Mobile App Style Thumb-Friendly Bottom Tab Bar
      ===================================================================== */}
      {!user.mustChangePassword && (
        <nav
          aria-label="แถบเมนูด้านล่าง (Mobile Bottom Navigation)"
          className="fixed bottom-0 inset-x-0 z-30 lg:hidden bg-white/95 dark:bg-[#1E1F20]/95 backdrop-blur-md border-t border-slate-200 dark:border-[#3C4043] px-1 py-1.5 grid grid-cols-5 gap-1 select-none"
        >
          <button
            type="button"
            onClick={() => {
              setCurrentView('FILES');
              setDriveTab('ALL');
            }}
            className="flex flex-col items-center justify-center gap-0.5 py-1 rounded-xl cursor-pointer"
          >
            <div
              className={`px-3.5 py-1 rounded-full transition ${
                currentView === 'FILES' && driveTab === 'ALL'
                  ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF]'
                  : 'text-[#444746] dark:text-[#C4C7C5]'
              }`}
            >
              <HardDrive className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-semibold text-[#1F1F1F] dark:text-[#E3E3E3] truncate">
              ทั้งหมด ({driveSummary.totalFilesCount})
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCurrentView('FILES');
              setDriveTab('PRIVATE');
            }}
            className="flex flex-col items-center justify-center gap-0.5 py-1 rounded-xl cursor-pointer"
          >
            <div
              className={`px-3.5 py-1 rounded-full transition ${
                currentView === 'FILES' && driveTab === 'PRIVATE'
                  ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF]'
                  : 'text-[#444746] dark:text-[#C4C7C5]'
              }`}
            >
              <FolderLock className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-semibold text-[#1F1F1F] dark:text-[#E3E3E3] truncate">
              ส่วนตัว ({driveSummary.privateCount})
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCurrentView('FILES');
              setDriveTab('PUBLIC');
            }}
            className="flex flex-col items-center justify-center gap-0.5 py-1 rounded-xl cursor-pointer"
          >
            <div
              className={`px-3.5 py-1 rounded-full transition ${
                currentView === 'FILES' && driveTab === 'PUBLIC'
                  ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF]'
                  : 'text-[#444746] dark:text-[#C4C7C5]'
              }`}
            >
              <Globe className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-semibold text-[#1F1F1F] dark:text-[#E3E3E3] truncate">
              ส่วนกลาง ({driveSummary.publicCount})
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCurrentView('FILES');
              setDriveTab('URLS');
            }}
            className="flex flex-col items-center justify-center gap-0.5 py-1 rounded-xl cursor-pointer"
          >
            <div
              className={`px-3.5 py-1 rounded-full transition ${
                currentView === 'FILES' && driveTab === 'URLS'
                  ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF]'
                  : 'text-[#444746] dark:text-[#C4C7C5]'
              }`}
            >
              <LinkIcon className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-semibold text-[#1F1F1F] dark:text-[#E3E3E3] truncate">
              ลิงก์ ({driveSummary.urlCount})
            </span>
          </button>

          {user.role === 'ADMIN' ? (
            <button
              type="button"
              onClick={() => setCurrentView(currentView === 'ADMIN' ? 'FILES' : 'ADMIN')}
              className="flex flex-col items-center justify-center gap-0.5 py-1 rounded-xl cursor-pointer"
            >
              <div
                className={`px-3.5 py-1 rounded-full transition ${
                  currentView === 'ADMIN'
                    ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF]'
                    : 'text-[#444746] dark:text-[#C4C7C5]'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-semibold text-[#1F1F1F] dark:text-[#E3E3E3] truncate">
                แอดมิน
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="flex flex-col items-center justify-center gap-0.5 py-1 rounded-xl cursor-pointer"
            >
              <div className="px-3.5 py-1 rounded-full text-[#444746] dark:text-[#C4C7C5]">
                <Menu className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-semibold text-[#1F1F1F] dark:text-[#E3E3E3] truncate">
                เมนูหมวดหมู่
              </span>
            </button>
          )}
        </nav>
      )}

      {/* Real-Time Floating Google Drive Toast Notifications (Bottom-Right, above Bottom Nav) */}
      {toasts.length > 0 && (
        <div className="fixed bottom-20 lg:bottom-5 right-3 sm:right-5 z-50 flex flex-col gap-3 w-[calc(100vw-1.5rem)] max-w-sm pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="pointer-events-auto bg-[#1F1F1F] dark:bg-[#282A2C] text-white rounded-2xl shadow-2xl border border-slate-700/80 p-4 flex flex-col gap-2.5 transition-all duration-300"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#C2E7FF] text-[#001D35] shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </span>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-[#A8C7FA]">
                        {t.type === 'URL_RECEIVED'
                          ? 'ลิงก์ใหม่เข้าสู่ระบบทันที!'
                          : t.type === 'FILE_UPDATED'
                          ? 'อัปเดตข้อมูลไฟล์ทันที!'
                          : 'ไฟล์ใหม่เข้าสู่ Google Drive ทันที!'}
                      </span>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                    <p className="text-[11px] text-slate-300">
                      อัปเดตหน้าเว็บอัตโนมัติแบบ Real-Time
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-slate-800/90 dark:bg-[#131314] rounded-xl p-2.5 space-y-1.5 border border-slate-700">
                <p className="text-xs sm:text-sm font-semibold text-white break-all line-clamp-2">
                  {t.title}
                </p>
                <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-300">
                  {t.visibility === 'PRIVATE' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 font-semibold">
                      <FolderLock className="w-3 h-3" />
                      Private (ส่วนตัว)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-200 border border-emerald-400/30 font-semibold">
                      <Globe className="w-3 h-3" />
                      Public (ส่วนกลาง)
                    </span>
                  )}
                  {t.fileCategory && (
                    <span className="px-2 py-0.5 rounded-md bg-slate-700 text-slate-200 font-medium">
                      {t.fileCategory}
                    </span>
                  )}
                  {typeof t.fileSizeBytes === 'number' && t.fileSizeBytes > 0 && (
                    <span>{formatFileSize(t.fileSizeBytes)}</span>
                  )}
                </div>
                {t.attachedMessage && (
                  <p className="text-xs text-amber-200 bg-amber-500/15 border border-amber-400/30 px-2.5 py-1 rounded-lg">
                    💬 ข้อความฝาก: {t.attachedMessage}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setCurrentView('FILES');
                    setGlobalSearchQuery(t.title);
                    setToasts((prev) => prev.filter((item) => item.id !== t.id));
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#A8C7FA] hover:bg-[#C2E7FF] text-[#001D35] text-xs font-bold transition cursor-pointer"
                >
                  {t.type === 'URL_RECEIVED' ? (
                    <>
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>ดูลิงก์ทันที</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5" />
                      <span>เปิดดูในไดรฟ์ทันที</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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
        onRefresh={() => fetchNotifications(false)}
        onNavigateToItem={(item) => {
          setShowInboxModal(false);
          setCurrentView('FILES');
          setHighlightedItem(item);
        }}
      />
    </div>
  );
};
