import React from 'react';
import { X, Download, FileText, Image as ImageIcon } from 'lucide-react';
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

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4 bg-slate-50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              {file.fileCategory === 'IMAGE' ? (
                <ImageIcon className="w-5 h-5" />
              ) : (
                <FileText className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-900 truncate text-sm sm:text-base">
                {file.originalName}
              </h3>
              <p className="text-xs text-slate-500">
                {file.fileCategory} • {formatFileSize(file.fileSizeBytes)} • ได้รับเมื่อ{' '}
                {formatDateTimeThai(file.receivedAt)} •{' '}
                <span
                  className={
                    file.visibility === 'PRIVATE'
                      ? 'text-indigo-700 font-medium'
                      : 'text-emerald-700 font-medium'
                  }
                >
                  {file.visibility === 'PRIVATE' ? 'ไฟล์ส่วนตัว (Private)' : 'ไฟล์ส่วนกลาง (Public)'}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href={downloadUrl}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-medium transition"
            >
              <Download className="w-4 h-4" />
              <span>ดาวน์โหลด</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition cursor-pointer"
              title="ปิดหน้าต่าง Preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Attached Message if present */}
        {file.attachedMessage && (
          <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-900">
            <span className="font-semibold">ข้อความที่แนบมากับไฟล์:</span> {file.attachedMessage}
          </div>
        )}

        {/* Preview Content Body (REQ-15: รองรับเฉพาะ PDF และรูปภาพ) */}
        <div className="flex-1 bg-slate-900/5 overflow-auto flex items-center justify-center p-4">
          {file.fileCategory === 'IMAGE' ? (
            <img
              src={previewUrl}
              alt={file.originalName}
              className="max-w-full max-h-full object-contain rounded-lg shadow-md bg-white"
            />
          ) : file.fileCategory === 'PDF' ? (
            <iframe
              src={previewUrl}
              title={file.originalName}
              className="w-full h-full rounded-lg border border-slate-300 bg-white"
            />
          ) : (
            <div className="text-center p-8 bg-white rounded-xl border border-slate-200">
              <p className="text-slate-700 font-medium mb-3">
                ไฟล์ประเภทนี้ไม่รองรับการแสดงตัวอย่างบนเบราว์เซอร์
              </p>
              <a
                href={downloadUrl}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium"
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

