import React from 'react';
import {
  X,
  Download,
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  ExternalLink,
  Smartphone,
  FolderLock,
  Globe,
} from 'lucide-react';
import { FileItem } from '../types/index.js';
import { formatFileSize, formatDateTimeThai } from '../api/client.js';

interface FilePreviewModalProps {
  file: FileItem | null;
  onClose: () => void;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({ file, onClose }) => {
  if (!file) return null;

  const previewUrl = `/api/files/${encodeURIComponent(file.fileUuid)}/preview`;
  const downloadUrl = `/api/files/${encodeURIComponent(file.fileUuid)}/download`;

  const renderHeaderIcon = () => {
    switch (file.fileCategory) {
      case 'PDF':
        return (
          <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
        );
      case 'IMAGE':
        return (
          <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
            <ImageIcon className="w-5 h-5" />
          </div>
        );
      case 'VIDEO':
        return (
          <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
            <Film className="w-5 h-5" />
          </div>
        );
      case 'AUDIO':
        return (
          <div className="w-10 h-10 rounded-xl bg-cyan-100 text-cyan-600 flex items-center justify-center shrink-0">
            <Music className="w-5 h-5" />
          </div>
        );
      default:
        return (
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
        );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl h-[92vh] sm:h-[90vh] flex flex-col overflow-hidden">
        {/* Top Header Bar (Google Drive Preview Style) */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-white">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {renderHeaderIcon()}
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 truncate text-sm sm:text-base">
                {file.originalName}
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-[#C4C7C5] mt-1">
                <div className="inline-flex items-center gap-1.5 font-semibold text-slate-800 dark:text-[#E3E3E3]">
                  {file.uploaderPictureUrl ? (
                    <img
                      src={file.uploaderPictureUrl}
                      alt={file.uploaderName || 'อาจารย์ผู้ส่งไฟล์ (LINE OA)'}
                      className="w-4 h-4 rounded-full object-cover ring-1 ring-slate-300 dark:ring-[#444746]"
                    />
                  ) : (
                    <span className="w-4 h-4 rounded-full bg-[#0B57D0] text-white text-[9px] font-bold inline-flex items-center justify-center">
                      {(file.uploaderName || 'อ').charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span>{file.uploaderName || 'อาจารย์ผู้ส่งไฟล์ (LINE OA)'}</span>
                </div>
                <span>•</span>
                <span>ส่งเมื่อ {formatDateTimeThai(file.receivedAt)}</span>
                <span>•</span>
                <span className="font-semibold text-slate-700 dark:text-[#E3E3E3]">
                  {file.fileCategory} (.{file.fileExtension}) • {formatFileSize(file.fileSizeBytes)}
                </span>
                <span>•</span>
                {file.visibility === 'PRIVATE' ? (
                  <span className="inline-flex items-center gap-1 text-indigo-700 dark:text-indigo-300 font-semibold">
                    <FolderLock className="w-3.5 h-3.5" />
                    Private{file.recipientUserIds ? ` (${file.recipientUserIds})` : ''}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 font-semibold">
                    <Globe className="w-3.5 h-3.5" />
                    Public (ส่วนกลาง)
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs sm:text-sm font-medium transition"
              title="เปิดดูแบบเต็มจอบนแท็บใหม่ (แนะนำสำหรับ iPhone / iPad)"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="hidden sm:inline">เปิดแท็บใหม่</span>
            </a>

            <a
              href={downloadUrl}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold transition shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>ดาวน์โหลด</span>
            </a>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
              title="ปิดหน้าต่าง Preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Attached Comment Banner if present */}
        {file.attachedMessage && (
          <div className="px-4 sm:px-6 py-2.5 bg-amber-50 dark:bg-amber-950/70 border-b border-amber-200 dark:border-amber-700/80 text-xs sm:text-sm text-amber-950 dark:text-[#FDE68A] flex items-center gap-2">
            <span>💬</span>
            <div>
              <span className="font-bold">ข้อความที่ฝากถึงผู้รับ (Comment):</span>{' '}
              <span className="font-medium">{file.attachedMessage}</span>
            </div>
          </div>
        )}

        {/* iPad / iPhone / Smartphone Native PDF Helper Bar */}
        {file.fileCategory === 'PDF' && (
          <div className="px-4 sm:px-6 py-2 bg-blue-50 dark:bg-blue-950/70 border-b border-blue-200 dark:border-blue-800 flex flex-wrap items-center justify-between gap-2 text-xs text-blue-900 dark:text-blue-200">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>
                ใช้งานบน <strong>iPad / iPhone / มือถือ</strong>: กดปุ่มด้านขวาเพื่อเปิดดู PDF แบบเต็มจอ (เลื่อนอ่านได้ทุกหน้าและซูมได้ลื่นไหล)
              </span>
            </div>
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shrink-0 shadow-xs"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>เปิด PDF เต็มจอ (iPad / iPhone)</span>
            </a>
          </div>
        )}

        {/* Preview Content Body */}
        <div className="flex-1 bg-slate-900/95 overflow-auto flex items-center justify-center p-2 sm:p-5">
          {file.fileCategory === 'IMAGE' ? (
            <img
              src={previewUrl}
              alt={file.originalName}
              className="max-w-full max-h-full object-contain rounded-xl shadow-2xl bg-white"
            />
          ) : file.fileCategory === 'VIDEO' ? (
            <div className="w-full h-full flex flex-col items-center justify-center">
              <video
                src={previewUrl}
                controls
                playsInline
                autoPlay
                preload="metadata"
                className="max-w-full max-h-[75vh] w-auto rounded-2xl shadow-2xl bg-black"
              >
                เบราว์เซอร์ของคุณไม่รองรับการเล่นวิดีโอโดยตรง กรุณากดดาวน์โหลด
              </video>
            </div>
          ) : file.fileCategory === 'AUDIO' ? (
            <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-xl space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-cyan-100 text-cyan-600 flex items-center justify-center mx-auto">
                <Music className="w-8 h-8" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 break-all">{file.originalName}</h4>
                <p className="text-xs text-slate-500 mt-1">
                  ไฟล์เสียง ({formatFileSize(file.fileSizeBytes)})
                </p>
              </div>
              <audio src={previewUrl} controls autoPlay preload="metadata" className="w-full" />
            </div>
          ) : file.fileCategory === 'PDF' ? (
            <iframe
              src={previewUrl}
              title={file.originalName}
              className="w-full h-full rounded-xl border border-slate-700 bg-white"
            />
          ) : (
            <div className="text-center p-8 bg-white rounded-2xl border border-slate-200 max-w-md">
              <p className="text-slate-700 font-medium mb-4">
                ไฟล์ประเภทนี้ไม่รองรับการแสดงตัวอย่างบนเบราว์เซอร์
              </p>
              <a
                href={downloadUrl}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold"
              >
                <Download className="w-4 h-4" />
                ดาวน์โหลดไฟล์ลงเครื่อง
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
