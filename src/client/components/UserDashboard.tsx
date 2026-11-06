import React, { useEffect, useState, useCallback } from 'react';
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
  Filter,
  Sparkles,
} from 'lucide-react';
import {
  DashboardSummary,
  FileItem,
  NotificationSubItem,
  UrlItem,
} from '../types/index.js';
import { apiFetch, formatDateTimeThai, formatFileSize } from '../api/client.js';
import { FilePreviewModal } from './FilePreviewModal.js';

interface UserDashboardProps {
  highlightedItem: NotificationSubItem | null;
  onClearHighlightedItem: () => void;
}

export const UserDashboard: React.FC<UserDashboardProps> = ({
  highlightedItem,
  onClearHighlightedItem,
}) => {
  const [activeTab, setActiveTab] = useState<'ALL' | 'PRIVATE' | 'PUBLIC' | 'URLS'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

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

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const visibilityParam =
        activeTab === 'PRIVATE' ? 'PRIVATE' : activeTab === 'PUBLIC' ? 'PUBLIC' : 'ALL';

      const params = new URLSearchParams();
      params.set('visibility', visibilityParam);
      if (categoryFilter !== 'ALL') params.set('category', categoryFilter);
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
      setUrls(urlData.urls);
    } catch (err) {
      console.error('Failed to load files:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, categoryFilter, searchQuery, dateFrom, dateTo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle jump from Notification Inbox (REQ-17: สามารถกดเพื่อไปยังไฟล์หรือรายการที่เกี่ยวข้องได้)
  useEffect(() => {
    if (!highlightedItem) return;
    if (highlightedItem.itemType === 'URL') {
      setActiveTab('URLS');
      setSearchQuery(highlightedItem.title);
    } else {
      setActiveTab('ALL');
      setSearchQuery(highlightedItem.title);
    }
    onClearHighlightedItem();
  }, [highlightedItem, onClearHighlightedItem]);

  const resetFilters = () => {
    setSearchQuery('');
    setCategoryFilter('ALL');
    setDateFrom('');
    setDateTo('');
  };

  const renderCategoryIcon = (cat: FileItem['fileCategory']) => {
    switch (cat) {
      case 'PDF':
        return <FileText className="w-5 h-5 text-red-600" />;
      case 'IMAGE':
        return <ImageIcon className="w-5 h-5 text-emerald-600" />;
      case 'VIDEO':
        return <Film className="w-5 h-5 text-purple-600" />;
      case 'AUDIO':
        return <Music className="w-5 h-5 text-amber-600" />;
      case 'ARCHIVE':
        return <Archive className="w-5 h-5 text-orange-600" />;
      case 'DOCUMENT':
        return <FileText className="w-5 h-5 text-blue-600" />;
      default:
        return <File className="w-5 h-5 text-slate-500" />;
    }
  };

  // Top 3 latest files for quick access section (Section 10.2: แสดงไฟล์ล่าสุด)
  const latestFiles = files.slice(0, 3);

  return (
    <div className="space-y-6">
      {/* 1. Summary Cards (Section 10.2: แสดงจำนวนไฟล์ / แสดงไฟล์ส่วนตัว / แสดงไฟล์ Public) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => setActiveTab('ALL')}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
            activeTab === 'ALL'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
              : 'bg-white text-slate-900 border-slate-200 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium opacity-80">ไฟล์ทั้งหมดที่เข้าถึงได้</span>
            <FileText className="w-5 h-5 opacity-80" />
          </div>
          <p className="text-2xl font-bold mt-2">{summary.totalFilesCount}</p>
          <p className="text-[11px] opacity-75 mt-0.5">รวมไฟล์ส่วนตัวและไฟล์ส่วนกลาง</p>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('PRIVATE')}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
            activeTab === 'PRIVATE'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
              : 'bg-white text-slate-900 border-slate-200 hover:border-indigo-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium opacity-80">ไฟล์ส่วนตัว (Private)</span>
            <FolderLock className="w-5 h-5 opacity-80" />
          </div>
          <p className="text-2xl font-bold mt-2">{summary.privateCount}</p>
          <p className="text-[11px] opacity-75 mt-0.5">เฉพาะบัญชีของคุณเท่านั้น</p>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('PUBLIC')}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
            activeTab === 'PUBLIC'
              ? 'bg-teal-600 text-white border-teal-600 shadow-md'
              : 'bg-white text-slate-900 border-slate-200 hover:border-teal-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium opacity-80">ไฟล์ส่วนกลาง (Public)</span>
            <Globe className="w-5 h-5 opacity-80" />
          </div>
          <p className="text-2xl font-bold mt-2">{summary.publicCount}</p>
          <p className="text-[11px] opacity-75 mt-0.5">เปิดให้ผู้ใช้งานทุกคนดาวน์โหลด</p>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('URLS')}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
            activeTab === 'URLS'
              ? 'bg-blue-600 text-white border-blue-600 shadow-md'
              : 'bg-white text-slate-900 border-slate-200 hover:border-blue-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium opacity-80">ลิงก์ (URL Records)</span>
            <LinkIcon className="w-5 h-5 opacity-80" />
          </div>
          <p className="text-2xl font-bold mt-2">{summary.urlCount}</p>
          <p className="text-[11px] opacity-75 mt-0.5">ลิงก์ที่อาจารย์ส่งผ่าน LINE OA</p>
        </button>
      </div>

      {/* 2. Latest Files Highlight (Section 10.2: แสดงไฟล์ล่าสุด) */}
      {activeTab !== 'URLS' && latestFiles.length > 0 && !searchQuery && !dateFrom && !dateTo && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-800">ไฟล์ล่าสุดที่ได้รับ</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {latestFiles.map((lf) => (
              <div
                key={`latest-${lf.fileUuid}`}
                className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 rounded-lg bg-white border border-slate-200 shrink-0">
                    {renderCategoryIcon(lf.fileCategory)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">
                      {lf.originalName}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {formatFileSize(lf.fileSizeBytes)} • {formatDateTimeThai(lf.receivedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {lf.isPreviewable && (
                    <button
                      type="button"
                      onClick={() => setPreviewFile(lf)}
                      className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-200 cursor-pointer"
                      title="Preview"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  )}
                  <a
                    href={`/api/files/${encodeURIComponent(lf.fileUuid)}/download`}
                    className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-100"
                    title="Download"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Search & Filter Bar (REQ-07, REQ-16: ค้นหาจากชื่อไฟล์, ข้อความ Message, วันที่, ประเภทไฟล์, พื้นที่จัดเก็บ) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาด้วยชื่อไฟล์ หรือข้อความ Message ที่แนบมากับไฟล์..."
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          {/* File Category Filter */}
          {activeTab !== 'URLS' && (
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-500 shrink-0" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                <option value="ALL">ทุกหมวดหมู่ไฟล์</option>
                <option value="PDF">PDF เอกสาร</option>
                <option value="IMAGE">รูปภาพ (Image)</option>
                <option value="DOCUMENT">เอกสาร (Word/Excel/PPT/Text)</option>
                <option value="VIDEO">วิดีโอ (Video)</option>
                <option value="AUDIO">ไฟล์เสียง (Audio)</option>
                <option value="ARCHIVE">ไฟล์บีบอัด (ZIP/RAR)</option>
                <option value="OTHER">อื่นๆ</option>
              </select>
            </div>
          )}

          {/* Date Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span className="text-xs text-slate-600">ตั้งแต่:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs sm:text-sm"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-600">ถึง:</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs sm:text-sm"
              />
            </div>
            {(searchQuery || categoryFilter !== 'ALL' || dateFrom || dateTo) && (
              <button
                type="button"
                onClick={resetFilters}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium cursor-pointer"
              >
                ล้างตัวกรอง
              </button>
            )}
            <button
              type="button"
              onClick={loadData}
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 cursor-pointer"
              title="รีเฟรชรายการ"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Storage Scope Tabs */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setActiveTab('ALL')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              activeTab === 'ALL'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            ไฟล์ทั้งหมด ({summary.totalFilesCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('PRIVATE')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              activeTab === 'PRIVATE'
                ? 'bg-indigo-600 text-white'
                : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
            }`}
          >
            เฉพาะไฟล์ส่วนตัว (Private: {summary.privateCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('PUBLIC')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              activeTab === 'PUBLIC'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            เฉพาะไฟล์ส่วนกลาง (Public: {summary.publicCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('URLS')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              activeTab === 'URLS'
                ? 'bg-blue-600 text-white'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}
          >
            รายการลิงก์ URL ({summary.urlCount})
          </button>
        </div>
      </div>

      {/* 4. File List OR URL List (Section 10.3, REQ-04, REQ-07, REQ-14, REQ-15) */}
      {activeTab === 'URLS' ? (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm sm:text-base">
              รายการลิงก์ (URL) ที่อาจารย์ส่งผ่าน LINE OA
            </h3>
            <span className="text-xs text-slate-500">พบ {urls.length} รายการ</span>
          </div>

          {urls.length === 0 ? (
            <div className="p-10 text-center text-slate-500 text-sm">
              ไม่พบรายการลิงก์ตามเงื่อนไขที่ค้นหา
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {urls.map((u) => (
                <div
                  key={u.urlUuid}
                  className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2.5 py-0.5 rounded-md text-xs font-semibold ${
                          u.visibility === 'PRIVATE'
                            ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        {u.visibility === 'PRIVATE' ? 'Private (ส่วนตัว)' : 'Public (ส่วนกลาง)'}
                      </span>
                      <span className="text-xs text-slate-500">
                        ได้รับเมื่อ: {formatDateTimeThai(u.receivedAt)}
                      </span>
                    </div>
                    <a
                      href={u.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-blue-600 hover:underline break-all inline-flex items-center gap-1.5"
                    >
                      <span>{u.url}</span>
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    </a>
                    {u.attachedMessage && (
                      <p className="text-xs text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg">
                        ข้อความที่เกี่ยวข้อง: {u.attachedMessage}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0">
                    <a
                      href={u.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>เปิดลิงก์ (Open URL)</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm sm:text-base">
              รายการไฟล์ ({activeTab === 'PRIVATE' ? 'เฉพาะไฟล์ส่วนตัว' : activeTab === 'PUBLIC' ? 'เฉพาะไฟล์ Public' : 'ไฟล์ส่วนตัวและไฟล์ Public'})
            </h3>
            <span className="text-xs text-slate-500">แสดง {files.length} ไฟล์</span>
          </div>

          {files.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm">
              ไม่พบรายการไฟล์ตามเงื่อนไขที่ค้นหา
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">ชื่อไฟล์</th>
                    <th className="py-3 px-3">ประเภทไฟล์</th>
                    <th className="py-3 px-3">ขนาด</th>
                    <th className="py-3 px-3">พื้นที่จัดเก็บ</th>
                    <th className="py-3 px-3">ข้อความที่แนบมา (Message)</th>
                    <th className="py-3 px-3">วันที่และเวลาที่ได้รับ</th>
                    <th className="py-3 px-4 text-right">การดำเนินการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {files.map((f) => (
                    <tr key={f.fileUuid} className="hover:bg-slate-50/80 transition">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-xl bg-slate-100 shrink-0">
                            {renderCategoryIcon(f.fileCategory)}
                          </div>
                          <span className="font-medium text-slate-900 break-all">
                            {f.originalName}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium">
                          {f.fileCategory} (.{f.fileExtension})
                        </span>
                      </td>
                      <td className="py-3.5 px-3 whitespace-nowrap text-xs text-slate-600">
                        {formatFileSize(f.fileSizeBytes)}
                      </td>
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        {f.visibility === 'PRIVATE' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-semibold">
                            <FolderLock className="w-3.5 h-3.5" />
                            Private (ส่วนตัว)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-semibold">
                            <Globe className="w-3.5 h-3.5" />
                            Public (ส่วนกลาง)
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 max-w-xs">
                        {f.attachedMessage ? (
                          <span className="text-xs text-slate-700 line-clamp-2">
                            {f.attachedMessage}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 whitespace-nowrap text-xs text-slate-600">
                        {formatDateTimeThai(f.receivedAt)}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-right">
                        <div className="inline-flex items-center gap-2">
                          {/* REQ-07 & REQ-15: ปุ่ม Preview แสดงเฉพาะไฟล์ PDF และรูปภาพที่รองรับเท่านั้น */}
                          {f.isPreviewable && (
                            <button
                              type="button"
                              onClick={() => setPreviewFile(f)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-medium cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Preview</span>
                            </button>
                          )}
                          <a
                            href={`/api/files/${encodeURIComponent(f.fileUuid)}/download`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download</span>
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Preview Modal */}
      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </div>
  );
};

