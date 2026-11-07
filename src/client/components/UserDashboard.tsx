import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Search,
  Calendar,
  FolderLock,
  Globe,
  Link as LinkIcon,
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  Archive,
  File,
  Eye,
  Download,
  ExternalLink,
  RefreshCw,
  Sparkles,
  LayoutGrid,
  List,
  Play,
  HardDrive,
  Check,
  Cloud,
  Users,
  ChevronRight,
  X,
  MessageSquare,
} from 'lucide-react';
import {
  DashboardSummary,
  FileItem,
  NotificationSubItem,
  UrlItem,
} from '../types/index.js';
import { apiFetch, formatDateTimeThai, formatFileSize } from '../api/client.js';
import { FilePreviewModal } from './FilePreviewModal.js';

export type DriveTabKey = 'ALL' | 'PRIVATE' | 'PUBLIC' | 'URLS';
export type CategoryKey =
  | 'ALL'
  | 'PDF'
  | 'VIDEO'
  | 'IMAGE'
  | 'DOCUMENT'
  | 'AUDIO'
  | 'ARCHIVE'
  | 'OTHER';

interface UserDashboardProps {
  highlightedItem: NotificationSubItem | null;
  onClearHighlightedItem: () => void;
  externalSearchQuery?: string;
  onExternalSearchChange?: (q: string) => void;
  refreshTrigger?: number;
  activeTab?: DriveTabKey;
  onActiveTabChange?: (tab: DriveTabKey) => void;
  categoryFilter?: CategoryKey;
  onCategoryFilterChange?: (cat: CategoryKey) => void;
  onSummaryUpdate?: (summary: DashboardSummary) => void;
}

interface CategoryMeta {
  key: CategoryKey;
  label: string;
  shortLabel: string;
  badgeBg: string;
  badgeText: string;
  cardBorder: string;
  iconBg: string;
}

export const CATEGORY_DEFINITIONS: CategoryMeta[] = [
  {
    key: 'PDF',
    label: 'เอกสาร PDF (PDF Documents)',
    shortLabel: 'PDF',
    badgeBg: 'bg-red-50 dark:bg-red-950/60',
    badgeText: 'text-red-700 dark:text-red-300',
    cardBorder: 'border-red-200 dark:border-red-800',
    iconBg: 'bg-red-100 dark:bg-red-950/70 text-[#EA4335]',
  },
  {
    key: 'VIDEO',
    label: 'คลิปวิดีโอ (Videos)',
    shortLabel: 'Video',
    badgeBg: 'bg-rose-50 dark:bg-rose-950/60',
    badgeText: 'text-rose-700 dark:text-rose-300',
    cardBorder: 'border-rose-200 dark:border-rose-800',
    iconBg: 'bg-rose-100 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400',
  },
  {
    key: 'IMAGE',
    label: 'รูปภาพ (Images)',
    shortLabel: 'รูปภาพ',
    badgeBg: 'bg-purple-50 dark:bg-purple-950/60',
    badgeText: 'text-purple-700 dark:text-purple-300',
    cardBorder: 'border-purple-200 dark:border-purple-800',
    iconBg: 'bg-purple-100 dark:bg-purple-950/70 text-purple-600 dark:text-purple-400',
  },
  {
    key: 'DOCUMENT',
    label: 'เอกสาร Office / ข้อความ (Docs, Sheets, Slides)',
    shortLabel: 'เอกสาร',
    badgeBg: 'bg-blue-50 dark:bg-blue-950/60',
    badgeText: 'text-blue-700 dark:text-blue-300',
    cardBorder: 'border-blue-200 dark:border-blue-800',
    iconBg: 'bg-blue-100 dark:bg-blue-950/70 text-[#0B57D0] dark:text-[#A8C7FA]',
  },
  {
    key: 'AUDIO',
    label: 'ไฟล์เสียง (Audio)',
    shortLabel: 'ไฟล์เสียง',
    badgeBg: 'bg-cyan-50 dark:bg-cyan-950/60',
    badgeText: 'text-cyan-700 dark:text-cyan-300',
    cardBorder: 'border-cyan-200 dark:border-cyan-800',
    iconBg: 'bg-cyan-100 dark:bg-cyan-950/70 text-cyan-600 dark:text-cyan-400',
  },
  {
    key: 'ARCHIVE',
    label: 'ไฟล์บีบอัด (ZIP / RAR)',
    shortLabel: 'ZIP/RAR',
    badgeBg: 'bg-amber-50 dark:bg-amber-950/60',
    badgeText: 'text-amber-700 dark:text-amber-300',
    cardBorder: 'border-amber-200 dark:border-amber-800',
    iconBg: 'bg-amber-100 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400',
  },
  {
    key: 'OTHER',
    label: 'ไฟล์อื่นๆ (Others)',
    shortLabel: 'อื่นๆ',
    badgeBg: 'bg-slate-100 dark:bg-[#282A2C]',
    badgeText: 'text-slate-700 dark:text-[#C4C7C5]',
    cardBorder: 'border-slate-200 dark:border-[#3C4043]',
    iconBg: 'bg-slate-200 dark:bg-[#282A2C] text-slate-700 dark:text-[#C4C7C5]',
  },
];

export const UserDashboard: React.FC<UserDashboardProps> = ({
  highlightedItem,
  onClearHighlightedItem,
  externalSearchQuery,
  onExternalSearchChange,
  refreshTrigger = 0,
  activeTab: controlledTab,
  onActiveTabChange,
  categoryFilter: controlledCategory,
  onCategoryFilterChange,
  onSummaryUpdate,
}) => {
  const [internalTab, setInternalTab] = useState<DriveTabKey>('ALL');
  const [internalSearchQuery, setInternalSearchQuery] = useState('');
  const [internalCategoryFilter, setInternalCategoryFilter] = useState<CategoryKey>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showDateFilterMobile, setShowDateFilterMobile] = useState(false);
  const [viewMode, setViewMode] = useState<'GRID' | 'LIST'>('GRID');

  const activeTab = controlledTab !== undefined ? controlledTab : internalTab;
  const setActiveTab = useCallback(
    (tab: DriveTabKey) => {
      if (onActiveTabChange) {
        onActiveTabChange(tab);
      } else {
        setInternalTab(tab);
      }
    },
    [onActiveTabChange]
  );

  const categoryFilter =
    controlledCategory !== undefined ? controlledCategory : internalCategoryFilter;
  const setCategoryFilter = useCallback(
    (cat: CategoryKey) => {
      if (onCategoryFilterChange) {
        onCategoryFilterChange(cat);
      } else {
        setInternalCategoryFilter(cat);
      }
    },
    [onCategoryFilterChange]
  );

  const searchQuery =
    externalSearchQuery !== undefined ? externalSearchQuery : internalSearchQuery;
  const setSearchQuery = useCallback(
    (val: string) => {
      if (onExternalSearchChange) {
        onExternalSearchChange(val);
      } else {
        setInternalSearchQuery(val);
      }
    },
    [onExternalSearchChange]
  );

  const [files, setFiles] = useState<FileItem[]>([]);
  const [urls, setUrls] = useState<UrlItem[]>([]);
  const [summary, setSummary] = useState<DashboardSummary>({
    privateCount: 0,
    publicCount: 0,
    totalFilesCount: 0,
    urlCount: 0,
  });

  const [loading, setLoading] = useState(true);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);

  const loadData = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }
      try {
        const visibilityParam =
          activeTab === 'PRIVATE' ? 'PRIVATE' : activeTab === 'PUBLIC' ? 'PUBLIC' : 'ALL';

        const params = new URLSearchParams();
        params.set('visibility', visibilityParam);
        if (searchQuery.trim()) params.set('q', searchQuery.trim());
        if (dateFrom) params.set('dateFrom', dateFrom);
        if (dateTo) params.set('dateTo', dateTo);

        const [fileData, urlData] = await Promise.all([
          apiFetch<{ files: FileItem[]; summary: DashboardSummary }>(
            `/api/files?${params.toString()}`
          ),
          apiFetch<{ urls: UrlItem[] }>(`/api/files/urls?${params.toString()}`),
        ]);

        setFiles(fileData.files);
        setSummary(fileData.summary);
        onSummaryUpdate?.(fileData.summary);
        setUrls(urlData.urls);
      } catch (err) {
        console.error('Failed to load files:', err);
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [activeTab, searchQuery, dateFrom, dateTo, onSummaryUpdate]
  );

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // Silent Real-Time refresh when SSE or notification event triggers
  useEffect(() => {
    if (refreshTrigger > 0) {
      loadData(true);
    }
  }, [refreshTrigger, loadData]);

  // Handle jump from Notification Inbox
  useEffect(() => {
    if (!highlightedItem) return;
    if (highlightedItem.itemType === 'URL') {
      setActiveTab('URLS');
      setSearchQuery(highlightedItem.title);
    } else {
      setActiveTab('ALL');
      setCategoryFilter('ALL');
      setSearchQuery(highlightedItem.title);
    }
    onClearHighlightedItem();
  }, [highlightedItem, onClearHighlightedItem, setActiveTab, setCategoryFilter, setSearchQuery]);

  const resetFilters = () => {
    setSearchQuery('');
    setCategoryFilter('ALL');
    setDateFrom('');
    setDateTo('');
  };

  // Count files per category for Google Drive category bar & sidebar
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: files.length,
      PDF: 0,
      VIDEO: 0,
      IMAGE: 0,
      DOCUMENT: 0,
      AUDIO: 0,
      ARCHIVE: 0,
      OTHER: 0,
    };
    for (const f of files) {
      counts[f.fileCategory] = (counts[f.fileCategory] || 0) + 1;
    }
    return counts;
  }, [files]);

  // Total storage size of currently visible files
  const totalBytesInView = useMemo(() => {
    return files.reduce((acc, item) => acc + (item.fileSizeBytes || 0), 0);
  }, [files]);

  // Filtered files according to selected category pill
  const displayedFiles = useMemo(() => {
    if (categoryFilter === 'ALL') return files;
    return files.filter((f) => f.fileCategory === categoryFilter);
  }, [files, categoryFilter]);

  // Group files by category when viewing "ALL" in Grid mode
  const groupedFilesByCategory = useMemo(() => {
    return CATEGORY_DEFINITIONS.map((cat) => ({
      meta: cat,
      items: displayedFiles.filter((f) => f.fileCategory === cat.key),
    })).filter((group) => group.items.length > 0);
  }, [displayedFiles]);

  const renderCategoryIcon = (
    cat: FileItem['fileCategory'] | CategoryKey,
    className = 'w-5 h-5'
  ) => {
    switch (cat) {
      case 'PDF':
        return <FileText className={`${className} text-[#EA4335]`} />;
      case 'VIDEO':
        return <Film className={`${className} text-rose-500`} />;
      case 'IMAGE':
        return <ImageIcon className={`${className} text-purple-500`} />;
      case 'DOCUMENT':
        return <FileText className={`${className} text-[#0B57D0] dark:text-[#A8C7FA]`} />;
      case 'AUDIO':
        return <Music className={`${className} text-cyan-500`} />;
      case 'ARCHIVE':
        return <Archive className={`${className} text-amber-500`} />;
      default:
        return <File className={`${className} text-[#444746] dark:text-[#C4C7C5]`} />;
    }
  };

  const latestFiles = files.slice(0, 4);

  const currentSectionTitle = useMemo(() => {
    if (activeTab === 'PRIVATE') return 'แชร์กับฉัน (Private)';
    if (activeTab === 'PUBLIC') return 'ไดรฟ์ส่วนกลาง (Public)';
    if (activeTab === 'URLS') return 'ลิงก์ที่แชร์ (URLs)';
    return 'ไดรฟ์ของฉัน (My Drive)';
  }, [activeTab]);

  const renderUploaderAvatar = (
    uploaderName?: string | null,
    uploaderPictureUrl?: string | null,
    sizeClass = 'w-6 h-6 text-[11px]'
  ) => {
    const displayName = (uploaderName || 'อาจารย์ผู้ส่งไฟล์ (LINE OA)').trim();
    const initial = displayName.replace(/^อาจารย์/, 'อ').charAt(0).toUpperCase() || 'L';

    if (uploaderPictureUrl) {
      return (
        <img
          src={uploaderPictureUrl}
          alt={displayName}
          className={`${sizeClass} rounded-full object-cover ring-1 ring-slate-300 dark:ring-[#444746] shrink-0 bg-[#0B57D0] text-white`}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      );
    }

    return (
      <div
        className={`${sizeClass} rounded-full bg-gradient-to-br from-[#0B57D0] to-[#0842A0] dark:from-[#A8C7FA] dark:to-[#0B57D0] text-white dark:text-[#001D35] font-bold flex items-center justify-center shrink-0 shadow-2xs ring-1 ring-white/50 dark:ring-[#3C4043]`}
        title={displayName}
      >
        {initial}
      </div>
    );
  };

  /**
   * Authentic Google Drive File Card (#F0F4F9 in Light / #1E1F20 in Dark, 16:10 preview box,
   * prominent Comment callout, and Google Drive Footer with Uploader Avatar + Name + Timestamp)
   */
  const renderDriveFileCard = (f: FileItem) => {
    const previewUrl = `/api/files/${encodeURIComponent(f.fileUuid)}/preview`;
    const downloadUrl = `/api/files/${encodeURIComponent(f.fileUuid)}/download`;
    const canOpenPreview =
      f.isPreviewable || ['PDF', 'IMAGE', 'VIDEO', 'AUDIO'].includes(f.fileCategory);
    const uploaderDisplay = f.uploaderName || 'อาจารย์ผู้ส่งไฟล์ (LINE OA)';

    return (
      <div
        key={f.fileUuid}
        className="group bg-[#F0F4F9] dark:bg-[#1E1F20] hover:bg-[#E2E7EF] dark:hover:bg-[#282A2C] rounded-2xl p-3 transition-all duration-150 flex flex-col justify-between border border-slate-200/70 dark:border-[#3C4043]/80 hover:border-[#0B57D0]/40 dark:hover:border-[#A8C7FA]/40 shadow-2xs hover:shadow-md"
      >
        <div>
          {/* Google Drive Card Top Header: File Type Icon + File Name + Extension Badge */}
          <div className="flex items-center justify-between gap-2 pb-2.5 px-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="shrink-0">{renderCategoryIcon(f.fileCategory, 'w-4 h-4')}</div>
              <span
                onClick={() => {
                  if (canOpenPreview) setPreviewFile(f);
                }}
                className={`text-xs sm:text-[13px] font-semibold text-[#1F1F1F] dark:text-[#E3E3E3] truncate ${
                  canOpenPreview ? ' cursor-pointer hover:underline' : ''
                }`}
                title={f.originalName}
              >
                {f.originalName}
              </span>
            </div>
            <span className="px-1.5 py-0.5 rounded-md bg-white dark:bg-[#131314] text-[#444746] dark:text-[#C4C7C5] text-[10px] font-bold uppercase shrink-0 border border-slate-200/80 dark:border-[#3C4043]">
              .{f.fileExtension}
            </span>
          </div>

          {/* Google Drive Inner 16:10 Rounded Preview Box */}
          <div
            onClick={() => {
              if (canOpenPreview) setPreviewFile(f);
            }}
            className={`relative h-36 sm:h-40 w-full rounded-xl overflow-hidden border border-slate-200/80 dark:border-[#3C4043] flex items-center justify-center ${
              canOpenPreview ? 'cursor-pointer' : ''
            } ${
              f.fileCategory === 'VIDEO' ? 'bg-[#131314]' : 'bg-white dark:bg-[#131314]'
            }`}
          >
            {f.fileCategory === 'IMAGE' ? (
              <img
                src={previewUrl}
                alt={f.originalName}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            ) : f.fileCategory === 'VIDEO' ? (
              <div className="flex flex-col items-center justify-center text-white space-y-2">
                <div className="w-12 h-12 rounded-full bg-rose-600/95 group-hover:bg-rose-500 group-hover:scale-110 transition flex items-center justify-center shadow-lg">
                  <Play className="w-6 h-6 text-white fill-white ml-0.5" />
                </div>
                <span className="text-[11px] font-medium text-slate-100 bg-black/70 px-2.5 py-0.5 rounded-full">
                  คลิกเพื่อเล่นวิดีโอ ({formatFileSize(f.fileSizeBytes)})
                </span>
              </div>
            ) : f.fileCategory === 'PDF' ? (
              <div className="w-full h-full bg-slate-100/80 dark:bg-[#18191A] flex flex-col items-center justify-center p-3">
                {/* Simulated Google Drive PDF Document Page Preview */}
                <div className="w-4/5 h-full bg-white dark:bg-[#242628] rounded-t-lg shadow-xs border border-slate-200/90 dark:border-[#3C4043] p-3 flex flex-col items-center justify-center space-y-2 group-hover:scale-[1.02] transition">
                  <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/60 text-[#EA4335] flex items-center justify-center border border-red-100 dark:border-red-900">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="w-full space-y-1">
                    <div className="h-1.5 w-3/4 mx-auto bg-slate-200 dark:bg-[#3C4043] rounded-full" />
                    <div className="h-1.5 w-1/2 mx-auto bg-slate-100 dark:bg-[#333537] rounded-full" />
                  </div>
                  <span className="text-[11px] font-semibold text-[#EA4335] dark:text-red-300 bg-red-50 dark:bg-red-950/60 px-2.5 py-0.5 rounded-full">
                    เปิดดูเอกสาร PDF
                  </span>
                </div>
              </div>
            ) : f.fileCategory === 'AUDIO' ? (
              <div className="flex flex-col items-center justify-center space-y-2 p-4 text-center">
                <div className="w-12 h-12 rounded-2xl bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 group-hover:scale-105 transition flex items-center justify-center border border-cyan-200 dark:border-cyan-900">
                  <Music className="w-6 h-6" />
                </div>
                <span className="text-[11px] font-semibold text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-950/60 px-2.5 py-0.5 rounded-full">
                  คลิกเพื่อฟังเสียง
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center space-y-2 p-4 text-center">
                <div className="w-12 h-12 rounded-2xl bg-[#F0F4F9] dark:bg-[#282A2C] text-[#0B57D0] dark:text-[#A8C7FA] flex items-center justify-center border border-slate-200 dark:border-[#3C4043]">
                  {renderCategoryIcon(f.fileCategory, 'w-6 h-6')}
                </div>
                <span className="text-[11px] font-medium text-[#444746] dark:text-[#C4C7C5]">
                  {f.fileCategory} • {formatFileSize(f.fileSizeBytes)}
                </span>
              </div>
            )}

            {/* Top-Right Scope Pill inside Thumbnail */}
            <div className="absolute top-2 right-2">
              {f.visibility === 'PRIVATE' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#0B57D0]/95 text-white text-[10px] font-semibold shadow-xs">
                  <FolderLock className="w-2.5 h-2.5" />
                  Private
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-600/95 text-white text-[10px] font-semibold shadow-xs">
                  <Globe className="w-2.5 h-2.5" />
                  Public
                </span>
              )}
            </div>

            {/* Bottom-Left File Size Pill inside Thumbnail */}
            <div className="absolute bottom-2 left-2">
              <span className="px-2 py-0.5 rounded-md bg-black/65 text-white text-[10px] font-semibold backdrop-blur-xs">
                {formatFileSize(f.fileSizeBytes)}
              </span>
            </div>
          </div>
        </div>

        {/* Card Metadata, Prominent Attached Comment & Authentic Google Drive Uploader Footer */}
        <div className="pt-2.5 px-0.5 space-y-2">
          {f.visibility === 'PRIVATE' && f.recipientUserIds && (
            <div className="text-[11px] text-[#001D35] dark:text-[#C2E7FF] bg-[#C2E7FF]/80 dark:bg-[#004A77]/80 px-2.5 py-1 rounded-lg font-semibold truncate">
              🔒 แชร์เฉพาะ: {f.recipientUserIds}
            </div>
          )}

          {/* Attached Message / Comment Box (Always crystal clear in Light & Dark Mode) */}
          {f.attachedMessage ? (
            <div className="px-2.5 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700/80 text-xs text-amber-950 dark:text-amber-100 flex items-start gap-2 shadow-2xs">
              <MessageSquare className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <span className="font-bold text-[11px] text-amber-800 dark:text-amber-300 block">
                  💬 ข้อความที่ฝาก:
                </span>
                <p className="line-clamp-2 break-words font-medium text-[#1F1F1F] dark:text-[#FDE68A]">
                  {f.attachedMessage}
                </p>
              </div>
            </div>
          ) : (
            <div className="px-2.5 py-1.5 rounded-xl bg-white/60 dark:bg-[#131314]/60 border border-slate-200/70 dark:border-[#3C4043] text-[11px] text-[#5F6368] dark:text-[#9AA0A6] flex items-center gap-1.5">
              <MessageSquare className="w-3 h-3 shrink-0 opacity-60" />
              <span className="truncate">ไม่มีข้อความที่ฝาก (Comment)</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5">
            {canOpenPreview && (
              <button
                type="button"
                onClick={() => setPreviewFile(f)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-full bg-white dark:bg-[#131314] hover:bg-[#D3E3FD] dark:hover:bg-[#004A77] text-[#0B57D0] dark:text-[#A8C7FA] border border-slate-200/90 dark:border-[#3C4043] text-xs font-semibold transition cursor-pointer"
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
            <a
              href={downloadUrl}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-full bg-[#0B57D0] hover:bg-[#0842A0] text-white text-xs font-semibold transition shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>ดาวน์โหลด</span>
            </a>
          </div>

          {/* Authentic Google Drive Bottom Footer: Uploader Profile Avatar + Name + Sent Timestamp */}
          <div className="pt-2 mt-1 border-t border-slate-200/90 dark:border-[#3C4043] flex items-center gap-2">
            {renderUploaderAvatar(uploaderDisplay, f.uploaderPictureUrl, 'w-6 h-6 text-[11px]')}
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-[11px] font-semibold text-[#1F1F1F] dark:text-[#E3E3E3] truncate">
                {uploaderDisplay}
              </p>
              <p className="text-[10px] text-[#5F6368] dark:text-[#9AA0A6] truncate">
                อัปโหลดเมื่อ {formatDateTimeThai(f.receivedAt)}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      {/* =====================================================================
          LEFT NAVIGATION RAIL (DESKTOP >= 1024px)
          On Portrait / Mobile (< lg), navigation is handled via the
          Top-Left Hamburger Drawer + Fixed Bottom Navigation Bar!
      ===================================================================== */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-16 space-y-4 px-1 select-none">
        {/* Google Drive "+ ใหม่ (New)" Floating Pill Button */}
        <div>
          <div className="inline-flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white dark:bg-[#282A2C] border border-slate-200/90 dark:border-[#3C4043] shadow-md hover:shadow-lg transition w-full">
            <div className="w-8 h-8 rounded-xl bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF] flex items-center justify-center shrink-0 font-bold text-lg">
              +
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-[#1F1F1F] dark:text-[#E3E3E3] truncate">
                รับไฟล์จาก LINE OA
              </p>
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold truncate">
                ● อัปเดตเข้าไดรฟ์อัตโนมัติทันที
              </p>
            </div>
          </div>
        </div>

        {/* Primary Google Drive Navigation Pills */}
        <nav className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('ALL')}
            className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-full text-sm transition cursor-pointer ${
              activeTab === 'ALL'
                ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF] font-bold'
                : 'text-[#444746] dark:text-[#C4C7C5] hover:bg-[#E8EAED] dark:hover:bg-[#282A2C] font-medium'
            }`}
          >
            <span className="flex items-center gap-3">
              <HardDrive className="w-4 h-4 shrink-0" />
              <span>ไดรฟ์ของฉัน (ทั้งหมด)</span>
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-white/70 dark:bg-[#131314]/60 text-[#001D35] dark:text-[#C2E7FF] font-bold">
              {summary.totalFilesCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('PRIVATE')}
            className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-full text-sm transition cursor-pointer ${
              activeTab === 'PRIVATE'
                ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF] font-bold'
                : 'text-[#444746] dark:text-[#C4C7C5] hover:bg-[#E8EAED] dark:hover:bg-[#282A2C] font-medium'
            }`}
          >
            <span className="flex items-center gap-3">
              <Users className="w-4 h-4 shrink-0" />
              <span>แชร์กับฉัน (Private)</span>
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-white/70 dark:bg-[#131314]/60 text-[#001D35] dark:text-[#C2E7FF] font-bold">
              {summary.privateCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('PUBLIC')}
            className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-full text-sm transition cursor-pointer ${
              activeTab === 'PUBLIC'
                ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF] font-bold'
                : 'text-[#444746] dark:text-[#C4C7C5] hover:bg-[#E8EAED] dark:hover:bg-[#282A2C] font-medium'
            }`}
          >
            <span className="flex items-center gap-3">
              <Globe className="w-4 h-4 shrink-0" />
              <span>ไดรฟ์ส่วนกลาง (Public)</span>
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-white/70 dark:bg-[#131314]/60 text-[#001D35] dark:text-[#C2E7FF] font-bold">
              {summary.publicCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('URLS')}
            className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-full text-sm transition cursor-pointer ${
              activeTab === 'URLS'
                ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF] font-bold'
                : 'text-[#444746] dark:text-[#C4C7C5] hover:bg-[#E8EAED] dark:hover:bg-[#282A2C] font-medium'
            }`}
          >
            <span className="flex items-center gap-3">
              <LinkIcon className="w-4 h-4 shrink-0" />
              <span>ลิงก์ที่แชร์ (URLs)</span>
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-white/70 dark:bg-[#131314]/60 text-[#001D35] dark:text-[#C2E7FF] font-bold">
              {summary.urlCount}
            </span>
          </button>
        </nav>

        {/* Category Section in Left Rail */}
        {activeTab !== 'URLS' && (
          <div className="pt-3 border-t border-slate-200/90 dark:border-[#3C4043] space-y-1">
            <p className="px-4 pb-1 text-[11px] font-bold uppercase tracking-wider text-[#5F6368] dark:text-[#8E918F]">
              หมวดหมู่ไฟล์ (Categories)
            </p>
            <button
              type="button"
              onClick={() => setCategoryFilter('ALL')}
              className={`w-full flex items-center justify-between px-4 py-2 rounded-full text-xs transition cursor-pointer ${
                categoryFilter === 'ALL'
                  ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF] font-bold'
                  : 'text-[#444746] dark:text-[#C4C7C5] hover:bg-[#E8EAED] dark:hover:bg-[#282A2C] font-medium'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <HardDrive className="w-3.5 h-3.5" />
                <span>ทุกหมวดหมู่</span>
              </span>
              <span>{categoryCounts.ALL || 0}</span>
            </button>

            {CATEGORY_DEFINITIONS.map((cat) => {
              const count = categoryCounts[cat.key] || 0;
              const isSelected = categoryFilter === cat.key;
              return (
                <button
                  key={`rail-${cat.key}`}
                  type="button"
                  onClick={() => setCategoryFilter(cat.key)}
                  className={`w-full flex items-center justify-between px-4 py-2 rounded-full text-xs transition cursor-pointer ${
                    isSelected
                      ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF] font-bold'
                      : 'text-[#444746] dark:text-[#C4C7C5] hover:bg-[#E8EAED] dark:hover:bg-[#282A2C] font-medium'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    {renderCategoryIcon(cat.key, 'w-3.5 h-3.5')}
                    <span className="truncate">{cat.shortLabel}</span>
                  </span>
                  <span className="text-[11px] opacity-80">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Google Drive Storage Indicator Box */}
        <div className="pt-3 border-t border-slate-200/90 dark:border-[#3C4043] px-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#444746] dark:text-[#C4C7C5]">
            <Cloud className="w-4 h-4 text-[#0B57D0] dark:text-[#A8C7FA]" />
            <span>พื้นที่เก็บข้อมูล (Storage)</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-[#333537] overflow-hidden">
            <div className="h-full bg-[#0B57D0] dark:bg-[#A8C7FA] rounded-full w-1/3" />
          </div>
          <p className="text-[11px] text-[#5F6368] dark:text-[#C4C7C5]">
            ใช้งานแล้ว{' '}
            <span className="font-bold text-[#1F1F1F] dark:text-[#E3E3E3]">
              {formatFileSize(totalBytesInView)}
            </span>{' '}
            ({summary.totalFilesCount} ไฟล์)
          </p>
        </div>
      </aside>

      {/* =====================================================================
          RIGHT MAIN GOOGLE DRIVE CANVAS (ROUNDED WORKSPACE)
      ===================================================================== */}
      <div className="flex-1 w-full min-w-0 bg-white dark:bg-[#131314] rounded-2xl sm:rounded-3xl border border-slate-200/80 dark:border-[#3C4043] shadow-2xs p-3 sm:p-6 min-h-[calc(100vh-8rem)] space-y-4 sm:space-y-5 transition-colors duration-200">
        {/* 1. Top Google Drive Canvas Header: Breadcrumb Title + Segmented View Toggle */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200/80 dark:border-[#3C4043]">
          <div className="flex items-center gap-1.5 min-w-0">
            <h2 className="text-base sm:text-xl font-semibold sm:font-normal text-[#1F1F1F] dark:text-[#E3E3E3] truncate">
              {currentSectionTitle}
            </h2>
            {categoryFilter !== 'ALL' && activeTab !== 'URLS' && (
              <>
                <ChevronRight className="w-4 h-4 text-[#5F6368] dark:text-[#C4C7C5] shrink-0" />
                <span className="px-2.5 py-0.5 rounded-full bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF] text-xs font-bold shrink-0">
                  {CATEGORY_DEFINITIONS.find((c) => c.key === categoryFilter)?.shortLabel}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Toggle Date Filter on Mobile Portrait */}
            <button
              type="button"
              onClick={() => setShowDateFilterMobile((prev) => !prev)}
              className={`sm:hidden p-2 rounded-full border transition cursor-pointer ${
                dateFrom || dateTo || showDateFilterMobile
                  ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF] border-transparent'
                  : 'border-slate-300 dark:border-[#444746] text-[#444746] dark:text-[#C4C7C5]'
              }`}
              title="กรองตามวันที่"
            >
              <Calendar className="w-4 h-4" />
            </button>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={() => loadData(false)}
              className="p-2 rounded-full hover:bg-[#F0F4F9] dark:hover:bg-[#282A2C] text-[#444746] dark:text-[#C4C7C5] transition cursor-pointer"
              title="รีเฟรชข้อมูล"
            >
              <RefreshCw
                className={`w-4 h-4 ${
                  loading ? 'animate-spin text-[#0B57D0] dark:text-[#A8C7FA]' : ''
                }`}
              />
            </button>

            {/* Google Drive Segmented Pill Toggle (List vs Grid) */}
            {activeTab !== 'URLS' && (
              <div className="inline-flex items-center rounded-full border border-[#747775]/50 dark:border-[#444746] overflow-hidden bg-white dark:bg-[#1E1F20]">
                <button
                  type="button"
                  onClick={() => setViewMode('LIST')}
                  className={`inline-flex items-center gap-1 px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer border-r border-[#747775]/40 dark:border-[#444746] ${
                    viewMode === 'LIST'
                      ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF]'
                      : 'text-[#444746] dark:text-[#C4C7C5] hover:bg-slate-100 dark:hover:bg-[#282A2C]'
                  }`}
                  title="มุมมองรายการ (List Layout)"
                >
                  {viewMode === 'LIST' && <Check className="w-3.5 h-3.5" />}
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('GRID')}
                  className={`inline-flex items-center gap-1 px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                    viewMode === 'GRID'
                      ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF]'
                      : 'text-[#444746] dark:text-[#C4C7C5] hover:bg-slate-100 dark:hover:bg-[#282A2C]'
                  }`}
                  title="มุมมองการ์ด (Google Drive Grid Layout)"
                >
                  {viewMode === 'GRID' && <Check className="w-3.5 h-3.5" />}
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 2. Google Drive Filter Chips Row (Horizontally Swipeable in Portrait Mode!) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            {activeTab !== 'URLS' ? (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 sm:flex-wrap no-scrollbar -mx-1 px-1">
                <button
                  type="button"
                  onClick={() => setCategoryFilter('ALL')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition shrink-0 cursor-pointer ${
                    categoryFilter === 'ALL'
                      ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF] border-transparent'
                      : 'bg-white dark:bg-[#1E1F20] hover:bg-[#F0F4F9] dark:hover:bg-[#282A2C] text-[#444746] dark:text-[#C4C7C5] border-[#747775]/40 dark:border-[#444746]'
                  }`}
                >
                  {categoryFilter === 'ALL' && <Check className="w-3.5 h-3.5" />}
                  <span>ทุกประเภท ({categoryCounts.ALL || 0})</span>
                </button>

                {CATEGORY_DEFINITIONS.map((cat) => {
                  const count = categoryCounts[cat.key] || 0;
                  const isSelected = categoryFilter === cat.key;
                  return (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => setCategoryFilter(isSelected ? 'ALL' : cat.key)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition shrink-0 cursor-pointer ${
                        isSelected
                          ? 'bg-[#C2E7FF] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF] border-transparent'
                          : 'bg-white dark:bg-[#1E1F20] hover:bg-[#F0F4F9] dark:hover:bg-[#282A2C] text-[#444746] dark:text-[#C4C7C5] border-[#747775]/40 dark:border-[#444746]'
                      }`}
                    >
                      {isSelected ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        renderCategoryIcon(cat.key, 'w-3.5 h-3.5')
                      )}
                      <span>
                        {cat.shortLabel} ({count})
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-[#5F6368] dark:text-[#C4C7C5]">
                แสดงรายการลิงก์เว็บไซต์ที่ส่งเข้ามาผ่าน LINE OA ทั้งหมด
              </div>
            )}

            {/* Desktop Date Filter Chip */}
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <div className="inline-flex items-center gap-1.5 bg-[#F8FAFD] dark:bg-[#1E1F20] px-3 py-1.5 rounded-lg border border-[#747775]/40 dark:border-[#444746]">
                <Calendar className="w-3.5 h-3.5 text-[#444746] dark:text-[#C4C7C5]" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  aria-label="ตั้งแต่วันที่"
                  className="bg-transparent text-xs text-[#1F1F1F] dark:text-[#E3E3E3] focus:outline-none"
                />
                <span className="text-xs text-slate-400">-</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  aria-label="ถึงวันที่"
                  className="bg-transparent text-xs text-[#1F1F1F] dark:text-[#E3E3E3] focus:outline-none"
                />
              </div>

              {(searchQuery || categoryFilter !== 'ALL' || dateFrom || dateTo) && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-950/60 hover:bg-red-100 dark:hover:bg-red-900/70 text-red-700 dark:text-red-300 text-xs font-semibold transition cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>ล้างตัวกรอง</span>
                </button>
              )}
            </div>
          </div>

          {/* Mobile Portrait Collapsible Date Filter */}
          {(showDateFilterMobile || dateFrom || dateTo) && (
            <div className="sm:hidden flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-[#F8FAFD] dark:bg-[#1E1F20] border border-slate-200 dark:border-[#3C4043]">
              <div className="flex items-center gap-1.5 text-xs">
                <Calendar className="w-3.5 h-3.5 text-[#0B57D0] dark:text-[#A8C7FA]" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  aria-label="ตั้งแต่วันที่"
                  className="bg-transparent text-xs text-[#1F1F1F] dark:text-[#E3E3E3] focus:outline-none"
                />
                <span>-</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  aria-label="ถึงวันที่"
                  className="bg-transparent text-xs text-[#1F1F1F] dark:text-[#E3E3E3] focus:outline-none"
                />
              </div>
              {(searchQuery || categoryFilter !== 'ALL' || dateFrom || dateTo) && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-xs font-semibold"
                >
                  ล้างตัวกรอง
                </button>
              )}
            </div>
          )}
        </div>

        {/* Active Search Banner */}
        {searchQuery && (
          <div className="flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-[#F0F4F9] dark:bg-[#1E1F20] border border-slate-200 dark:border-[#3C4043] gap-2">
            <div className="flex items-center gap-2 text-xs text-[#1F1F1F] dark:text-[#E3E3E3] min-w-0">
              <Search className="w-4 h-4 text-[#0B57D0] dark:text-[#A8C7FA] shrink-0" />
              <span className="truncate">
                ค้นหา: <strong className="text-[#0B57D0] dark:text-[#A8C7FA]">"{searchQuery}"</strong>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-xs font-semibold text-[#0B57D0] dark:text-[#A8C7FA] hover:underline shrink-0 cursor-pointer"
            >
              แสดงทั้งหมด
            </button>
          </div>
        )}

        {/* 3. Google Drive "แนะนำสำหรับคุณ (Suggested)" Recent Strip */}
        {activeTab !== 'URLS' &&
          categoryFilter === 'ALL' &&
          latestFiles.length > 0 &&
          !searchQuery &&
          !dateFrom &&
          !dateTo && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#0B57D0] dark:text-[#A8C7FA]" />
                <h3 className="text-xs sm:text-sm font-semibold text-[#444746] dark:text-[#C4C7C5]">
                  แนะนำสำหรับคุณ • เพิ่งเข้ามาล่าสุด (Suggested)
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-3">
                {latestFiles.map((lf) => {
                  const canPreview =
                    lf.isPreviewable ||
                    ['PDF', 'IMAGE', 'VIDEO', 'AUDIO'].includes(lf.fileCategory);
                  const uploaderDisplay = lf.uploaderName || 'อาจารย์ผู้ส่งไฟล์ (LINE OA)';
                  return (
                    <div
                      key={`latest-${lf.fileUuid}`}
                      onClick={() => {
                        if (canPreview) setPreviewFile(lf);
                      }}
                      className={`p-3 rounded-2xl bg-[#F0F4F9] dark:bg-[#1E1F20] hover:bg-[#E2E7EF] dark:hover:bg-[#282A2C] border border-slate-200/70 dark:border-[#3C4043]/80 transition flex flex-col justify-between gap-2 ${
                        canPreview ? 'cursor-pointer' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-white dark:bg-[#131314] flex items-center justify-center shrink-0 shadow-2xs border border-slate-200/60 dark:border-[#3C4043]">
                            {renderCategoryIcon(lf.fileCategory, 'w-5 h-5')}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[#1F1F1F] dark:text-[#E3E3E3] truncate">
                              {lf.originalName}
                            </p>
                            <p className="text-[11px] text-[#5F6368] dark:text-[#C4C7C5] truncate">
                              {lf.fileCategory} • {formatFileSize(lf.fileSizeBytes)}
                            </p>
                          </div>
                        </div>
                        <a
                          href={`/api/files/${encodeURIComponent(lf.fileUuid)}/download`}
                          onClick={(e) => e.stopPropagation()}
                          className="p-2 rounded-full hover:bg-white dark:hover:bg-[#131314] text-[#0B57D0] dark:text-[#A8C7FA] transition shrink-0"
                          title="ดาวน์โหลด"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      </div>

                      {lf.attachedMessage && (
                        <div className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700/80 text-[11px] text-amber-950 dark:text-[#FDE68A] truncate font-medium">
                          💬 {lf.attachedMessage}
                        </div>
                      )}

                      <div className="pt-1.5 border-t border-slate-200/70 dark:border-[#3C4043] flex items-center gap-2 text-[10px] text-[#5F6368] dark:text-[#9AA0A6]">
                        {renderUploaderAvatar(uploaderDisplay, lf.uploaderPictureUrl, 'w-4 h-4 text-[9px]')}
                        <span className="font-semibold text-[#1F1F1F] dark:text-[#E3E3E3] truncate">
                          {uploaderDisplay}
                        </span>
                        <span>•</span>
                        <span className="truncate">{formatDateTimeThai(lf.receivedAt)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        {/* 4. Main Content Area: URLs View OR Categorized Google Drive Files View */}
        {activeTab === 'URLS' ? (
          <div className="rounded-2xl border border-slate-200 dark:border-[#3C4043] overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 bg-[#F8FAFD] dark:bg-[#1E1F20] border-b border-slate-200 dark:border-[#3C4043] flex items-center justify-between">
              <h3 className="font-semibold text-[#1F1F1F] dark:text-[#E3E3E3] text-xs sm:text-sm">
                รายการลิงก์ (URL) ที่ส่งผ่าน LINE OA
              </h3>
              <span className="text-xs text-[#5F6368] dark:text-[#C4C7C5]">
                พบ {urls.length} รายการ
              </span>
            </div>

            {urls.length === 0 ? (
              <div className="p-12 text-center text-[#5F6368] dark:text-[#C4C7C5] text-sm">
                ไม่พบรายการลิงก์ตามเงื่อนไขที่ค้นหา
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-[#3C4043]">
                {urls.map((u) => (
                  <div
                    key={u.urlUuid}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#F8FAFD] dark:hover:bg-[#1E1F20] transition"
                  >
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            u.visibility === 'PRIVATE'
                              ? 'bg-[#D3E3FD] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF]'
                              : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                          }`}
                        >
                          {u.visibility === 'PRIVATE' ? 'Private (ส่วนตัว)' : 'Public (ส่วนกลาง)'}
                        </span>
                        <div className="inline-flex items-center gap-1.5 text-xs text-[#5F6368] dark:text-[#C4C7C5]">
                          {renderUploaderAvatar(
                            u.uploaderName || 'อาจารย์ผู้ส่งไฟล์ (LINE OA)',
                            u.uploaderPictureUrl,
                            'w-5 h-5 text-[10px]'
                          )}
                          <span className="font-semibold text-[#1F1F1F] dark:text-[#E3E3E3]">
                            {u.uploaderName || 'อาจารย์ผู้ส่งไฟล์ (LINE OA)'}
                          </span>
                          <span>•</span>
                          <span>ส่งเมื่อ {formatDateTimeThai(u.receivedAt)}</span>
                        </div>
                      </div>
                      <a
                        href={u.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold text-[#0B57D0] dark:text-[#A8C7FA] hover:underline break-all inline-flex items-center gap-1.5"
                      >
                        <span>{u.url}</span>
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      </a>
                      {u.attachedMessage && (
                        <p className="text-xs text-amber-950 dark:text-[#FDE68A] bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700/80 px-3 py-1.5 rounded-xl w-fit font-medium">
                          💬 ข้อความที่ฝาก: {u.attachedMessage}
                        </p>
                      )}
                    </div>

                    <div className="shrink-0">
                      <a
                        href={u.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full sm:w-auto justify-center inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#0B57D0] hover:bg-[#0842A0] text-white text-xs font-semibold"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span>เปิดลิงก์</span>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : displayedFiles.length === 0 ? (
          <div className="p-12 sm:p-16 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-[#F0F4F9] dark:bg-[#1E1F20] text-[#5F6368] dark:text-[#C4C7C5] flex items-center justify-center mx-auto">
              <HardDrive className="w-8 h-8" />
            </div>
            <p className="text-[#1F1F1F] dark:text-[#E3E3E3] font-semibold text-base">
              ยังไม่มีไฟล์ในหมวดหมู่นี้
            </p>
            <p className="text-xs text-[#5F6368] dark:text-[#C4C7C5]">
              เมื่อส่งไฟล์ รูปภาพ PDF หรือคลิปวิดีโอเข้า LINE OA ไฟล์จะปรากฏในหน้านี้ทันทีแบบ Real-Time
            </p>
          </div>
        ) : viewMode === 'GRID' ? (
          /* GOOGLE DRIVE CATEGORIZED GRID VIEW */
          <div className="space-y-6 sm:space-y-8">
            {groupedFilesByCategory.map((group) => (
              <section key={group.meta.key} className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-[#3C4043] pb-2 px-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${group.meta.iconBg}`}
                    >
                      {renderCategoryIcon(group.meta.key, 'w-4 h-4')}
                    </div>
                    <h3 className="text-xs sm:text-sm font-semibold text-[#444746] dark:text-[#E3E3E3] truncate">
                      {group.meta.label}
                    </h3>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold shrink-0 ${group.meta.badgeBg} ${group.meta.badgeText}`}
                  >
                    {group.items.length} ไฟล์
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-4">
                  {group.items.map((f) => renderDriveFileCard(f))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          /* GOOGLE DRIVE LIST VIEW (Responsive Portrait List + Desktop Table) */
          <div>
            {/* Mobile / Portrait Vertical List (< md) — Zero Horizontal Scroll! */}
            <div className="md:hidden divide-y divide-slate-200 dark:divide-[#3C4043]">
              {displayedFiles.map((f) => {
                const canPreview =
                  f.isPreviewable ||
                  ['PDF', 'IMAGE', 'VIDEO', 'AUDIO'].includes(f.fileCategory);
                const uploaderDisplay = f.uploaderName || 'อาจารย์ผู้ส่งไฟล์ (LINE OA)';
                return (
                  <div
                    key={`mob-list-${f.fileUuid}`}
                    onClick={() => {
                      if (canPreview) setPreviewFile(f);
                    }}
                    className="py-3.5 px-1 flex flex-col gap-2 active:bg-[#F0F4F9] dark:active:bg-[#1E1F20]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="p-2 rounded-xl bg-[#F0F4F9] dark:bg-[#1E1F20] shrink-0 mt-0.5">
                          {renderCategoryIcon(f.fileCategory, 'w-5 h-5')}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[#1F1F1F] dark:text-[#E3E3E3] break-all">
                            {f.originalName}
                          </p>
                          <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-[#5F6368] dark:text-[#C4C7C5] mt-1">
                            {renderUploaderAvatar(
                              uploaderDisplay,
                              f.uploaderPictureUrl,
                              'w-4 h-4 text-[9px]'
                            )}
                            <span className="font-semibold text-[#1F1F1F] dark:text-[#E3E3E3]">
                              {uploaderDisplay}
                            </span>
                            <span>•</span>
                            <span>{formatDateTimeThai(f.receivedAt)}</span>
                            <span>•</span>
                            <span>{formatFileSize(f.fileSizeBytes)}</span>
                          </div>
                        </div>
                      </div>
                      {f.visibility === 'PRIVATE' ? (
                        <span className="px-2 py-0.5 rounded-full bg-[#D3E3FD] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF] text-[10px] font-bold shrink-0">
                          Private
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold shrink-0">
                          Public
                        </span>
                      )}
                    </div>

                    {f.attachedMessage && (
                      <div className="ml-11 px-2.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700/80 text-xs text-amber-950 dark:text-[#FDE68A] font-medium">
                        💬 ข้อความที่ฝาก: {f.attachedMessage}
                      </div>
                    )}

                    <div
                      className="ml-11 flex items-center gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {canPreview && (
                        <button
                          type="button"
                          onClick={() => setPreviewFile(f)}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-full border border-slate-300 dark:border-[#3C4043] text-[#0B57D0] dark:text-[#A8C7FA] text-xs font-semibold"
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
                      <a
                        href={`/api/files/${encodeURIComponent(f.fileUuid)}/download`}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#0B57D0] text-white text-xs font-semibold"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>ดาวน์โหลด</span>
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop / Tablet Landscape Table (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-[#3C4043] text-xs font-semibold text-[#444746] dark:text-[#C4C7C5]">
                    <th className="py-3 px-4">ชื่อไฟล์ (Name)</th>
                    <th className="py-3 px-3">ผู้อัปโหลด (Owner)</th>
                    <th className="py-3 px-3">การเข้าถึง / ผู้รับ</th>
                    <th className="py-3 px-3">ข้อความที่ฝาก (Comment)</th>
                    <th className="py-3 px-3">เวลาที่ส่ง</th>
                    <th className="py-3 px-3">ขนาดไฟล์</th>
                    <th className="py-3 px-4 text-right">การดำเนินการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 dark:divide-[#3C4043] text-sm">
                  {displayedFiles.map((f) => {
                    const canPreview =
                      f.isPreviewable ||
                      ['PDF', 'IMAGE', 'VIDEO', 'AUDIO'].includes(f.fileCategory);
                    const uploaderDisplay = f.uploaderName || 'อาจารย์ผู้ส่งไฟล์ (LINE OA)';
                    return (
                      <tr
                        key={f.fileUuid}
                        onClick={() => {
                          if (canPreview) setPreviewFile(f);
                        }}
                        className={`hover:bg-[#F0F4F9] dark:hover:bg-[#1E1F20] transition ${
                          canPreview ? 'cursor-pointer' : ''
                        }`}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="shrink-0">{renderCategoryIcon(f.fileCategory)}</div>
                            <div>
                              <span className="font-medium text-[#1F1F1F] dark:text-[#E3E3E3] break-all block">
                                {f.originalName}
                              </span>
                              <span className="text-[11px] text-[#5F6368] dark:text-[#9AA0A6]">
                                {f.fileCategory} (.{f.fileExtension})
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            {renderUploaderAvatar(
                              uploaderDisplay,
                              f.uploaderPictureUrl,
                              'w-6 h-6 text-[11px]'
                            )}
                            <span className="text-xs font-medium text-[#1F1F1F] dark:text-[#E3E3E3]">
                              {uploaderDisplay}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          {f.visibility === 'PRIVATE' ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#D3E3FD] dark:bg-[#004A77] text-[#001D35] dark:text-[#C2E7FF] text-xs font-semibold w-fit">
                                <FolderLock className="w-3 h-3" />
                                Private
                              </span>
                              {f.recipientUserIds && (
                                <span className="text-[11px] text-[#0B57D0] dark:text-[#A8C7FA] font-medium">
                                  ถึง: {f.recipientUserIds}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-semibold">
                              <Globe className="w-3 h-3" />
                              Public
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 max-w-xs">
                          {f.attachedMessage ? (
                            <div className="inline-flex items-start gap-1.5 px-2.5 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700/80 text-xs text-amber-950 dark:text-[#FDE68A] font-medium">
                              <span className="shrink-0">💬</span>
                              <span className="break-words">{f.attachedMessage}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap text-xs text-[#5F6368] dark:text-[#C4C7C5]">
                          {formatDateTimeThai(f.receivedAt)}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap text-xs text-[#5F6368] dark:text-[#C4C7C5]">
                          {formatFileSize(f.fileSizeBytes)}
                        </td>
                        <td
                          className="py-3 px-4 whitespace-nowrap text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1.5">
                            {canPreview && (
                              <button
                                type="button"
                                onClick={() => setPreviewFile(f)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-slate-300 dark:border-[#3C4043] hover:bg-[#D3E3FD] dark:hover:bg-[#004A77] hover:border-[#0B57D0] text-[#0B57D0] dark:text-[#A8C7FA] text-xs font-semibold cursor-pointer"
                              >
                                {f.fileCategory === 'VIDEO' ? (
                                  <>
                                    <Play className="w-3.5 h-3.5" />
                                    <span>เล่น</span>
                                  </>
                                ) : (
                                  <>
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>เปิดดู</span>
                                  </>
                                )}
                              </button>
                            )}
                            <a
                              href={`/api/files/${encodeURIComponent(f.fileUuid)}/download`}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#0B57D0] hover:bg-[#0842A0] text-white text-xs font-semibold"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>ดาวน์โหลด</span>
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Preview Modal (Supports PDF, Video, Image, Audio on iPad, iPhone, Smartphone & PC) */}
        <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      </div>
    </div>
  );
};
