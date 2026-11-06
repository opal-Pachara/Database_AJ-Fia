import React, { useState } from 'react';
import {
  Bell,
  X,
  Check,
  CheckCheck,
  Trash2,
  ChevronDown,
  ChevronRight,
  FileText,
  Link as LinkIcon,
  ExternalLink,
  MailOpen,
  Mail,
} from 'lucide-react';
import { NotificationGroup, NotificationSubItem } from '../types/index.js';
import { apiFetch, formatDateTimeThai, formatFileSize } from '../api/client.js';

interface NotificationInboxModalProps {
  isOpen: boolean;
  groups: NotificationGroup[];
  unreadItemCount: number;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onNavigateToItem: (item: NotificationSubItem) => void;
}

export const NotificationInboxModal: React.FC<NotificationInboxModalProps> = ({
  isOpen,
  groups,
  unreadItemCount,
  onClose,
  onRefresh,
  onNavigateToItem,
}) => {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!isOpen) return null;

  const toggleExpand = (groupUuid: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupUuid]: !(prev[groupUuid] ?? true),
    }));
  };

  const handleMarkGroupRead = async (groupUuid: string, isRead: boolean) => {
    setBusyId(groupUuid);
    try {
      await apiFetch(`/api/notifications/groups/${encodeURIComponent(groupUuid)}/read`, {
        method: 'PATCH',
        body: JSON.stringify({ isRead }),
      });
      await onRefresh();
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkItemRead = async (notificationUuid: string, isRead: boolean) => {
    setBusyId(notificationUuid);
    try {
      await apiFetch(`/api/notifications/items/${encodeURIComponent(notificationUuid)}/read`, {
        method: 'PATCH',
        body: JSON.stringify({ isRead }),
      });
      await onRefresh();
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteGroup = async (groupUuid: string) => {
    setBusyId(groupUuid);
    try {
      await apiFetch(`/api/notifications/groups/${encodeURIComponent(groupUuid)}`, {
        method: 'DELETE',
      });
      await onRefresh();
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteItem = async (notificationUuid: string) => {
    setBusyId(notificationUuid);
    try {
      await apiFetch(`/api/notifications/items/${encodeURIComponent(notificationUuid)}`, {
        method: 'DELETE',
      });
      await onRefresh();
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkAllRead = async () => {
    setBusyId('ALL');
    try {
      await apiFetch('/api/notifications/read-all', { method: 'POST' });
      await onRefresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[86vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  กล่องแจ้งเตือน (Notification Inbox)
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-600 text-white">
                  ยังไม่อ่าน {unreadItemCount} รายการ
                </span>
              </div>
              <p className="text-xs text-slate-500">
                รวมกลุ่มการแจ้งเตือนตามช่วงเวลาเหตุการณ์ที่ได้รับไฟล์หรือลิงก์จากอาจารย์
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {unreadItemCount > 0 && (
              <button
                type="button"
                disabled={busyId === 'ALL'}
                onClick={handleMarkAllRead}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-medium transition cursor-pointer"
              >
                <CheckCheck className="w-4 h-4" />
                <span>อ่านทั้งหมด</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {groups.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Bell className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="font-medium text-slate-700">ไม่มีรายการแจ้งเตือนในขณะนี้</p>
              <p className="text-xs text-slate-400 mt-1">
                เมื่ออาจารย์ส่งไฟล์หรือลิงก์ใหม่ ระบบจะแสดงการแจ้งเตือนที่นี่
              </p>
            </div>
          ) : (
            groups.map((group) => {
              const isExpanded = expandedGroups[group.groupUuid] ?? true;
              return (
                <div
                  key={group.groupUuid}
                  className={`rounded-xl border transition ${
                    group.isRead
                      ? 'bg-white border-slate-200'
                      : 'bg-emerald-50/40 border-emerald-300 shadow-xs'
                  }`}
                >
                  {/* Group Header */}
                  <div className="p-3.5 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => toggleExpand(group.groupUuid)}
                      className="flex items-center gap-2.5 text-left min-w-0 flex-1 cursor-pointer"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {!group.isRead && (
                            <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
                          )}
                          <span className="font-semibold text-sm text-slate-900 truncate">
                            {group.titleSummary}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                              group.visibilityScope === 'PRIVATE'
                                ? 'bg-indigo-100 text-indigo-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {group.visibilityScope === 'PRIVATE' ? 'Private' : 'Public'}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-medium">
                            {group.itemCount} รายการ
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          ช่วงเวลาที่ได้รับ: {formatDateTimeThai(group.firstReceivedAt)}
                          {group.lastReceivedAt !== group.firstReceivedAt
                            ? ` ถึง ${formatDateTimeThai(group.lastReceivedAt)}`
                            : ''}
                        </p>
                      </div>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={busyId === group.groupUuid}
                        onClick={() => handleMarkGroupRead(group.groupUuid, !group.isRead)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-xs text-slate-700 inline-flex items-center gap-1 cursor-pointer"
                        title={group.isRead ? 'ทำเครื่องหมายว่ายังไม่อ่าน' : 'ทำเครื่องหมายว่าอ่านแล้ว'}
                      >
                        {group.isRead ? (
                          <>
                            <Mail className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">ทำเป็นยังไม่อ่าน</span>
                          </>
                        ) : (
                          <>
                            <MailOpen className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="hidden sm:inline">อ่านแล้ว</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={busyId === group.groupUuid}
                        onClick={() => handleDeleteGroup(group.groupUuid)}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-red-50 hover:border-red-200 text-slate-500 hover:text-red-600 cursor-pointer"
                        title="ลบกลุ่มการแจ้งเตือนนี้"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Group Items */}
                  {isExpanded && (
                    <div className="border-t border-slate-200/80 divide-y divide-slate-100 bg-white rounded-b-xl">
                      {group.items.map((item) => (
                        <div
                          key={item.notificationUuid}
                          className={`px-4 py-3 flex items-start justify-between gap-3 ${
                            item.isRead ? 'opacity-80' : 'bg-emerald-50/20'
                          }`}
                        >
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            <div className="mt-0.5 p-1.5 rounded-lg bg-slate-100 text-slate-600 shrink-0">
                              {item.itemType === 'URL' ? (
                                <LinkIcon className="w-4 h-4 text-blue-600" />
                              ) : (
                                <FileText className="w-4 h-4 text-emerald-600" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                {!item.isRead && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0" />
                                )}
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (!item.isRead) {
                                      await handleMarkItemRead(item.notificationUuid, true);
                                    }
                                    onNavigateToItem(item);
                                  }}
                                  className="text-sm font-medium text-emerald-700 hover:underline truncate text-left inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <span className="truncate">{item.title}</span>
                                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                                </button>
                              </div>
                              <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-2">
                                <span>ประเภท: {item.fileType || item.itemType}</span>
                                {item.fileSizeBytes !== null && (
                                  <span>• ขนาด: {formatFileSize(item.fileSizeBytes)}</span>
                                )}
                                <span>• เวลา: {formatDateTimeThai(item.receivedAt)}</span>
                              </div>
                              {item.detailMessage && (
                                <p className="text-xs text-slate-600 mt-1 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">
                                  ข้อความแนบ: {item.detailMessage}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={busyId === item.notificationUuid}
                              onClick={() =>
                                handleMarkItemRead(item.notificationUuid, !item.isRead)
                              }
                              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 text-xs cursor-pointer"
                              title={item.isRead ? 'ทำเป็นยังไม่อ่าน' : 'ทำเป็นอ่านแล้ว'}
                            >
                              <Check
                                className={`w-4 h-4 ${
                                  item.isRead ? 'text-slate-400' : 'text-emerald-600'
                                }`}
                              />
                            </button>
                            <button
                              type="button"
                              disabled={busyId === item.notificationUuid}
                              onClick={() => handleDeleteItem(item.notificationUuid)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                              title="ลบการแจ้งเตือนนี้"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

