export interface AuthUser {
  id: number;
  userId: string;
  fullName: string;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  mustChangePassword: boolean;
}

export interface FileItem {
  fileUuid: string;
  originalName: string;
  mimeType: string;
  fileExtension: string;
  fileCategory: 'PDF' | 'IMAGE' | 'DOCUMENT' | 'VIDEO' | 'AUDIO' | 'ARCHIVE' | 'OTHER';
  fileSizeBytes: number;
  attachedMessage: string | null;
  visibility: 'PRIVATE' | 'PUBLIC';
  isPreviewable: boolean;
  receivedAt: string;
  recipientUserIds?: string | null;
}

export interface UrlItem {
  urlUuid: string;
  url: string;
  attachedMessage: string | null;
  visibility: 'PRIVATE' | 'PUBLIC';
  receivedAt: string;
}

export interface DashboardSummary {
  privateCount: number;
  publicCount: number;
  totalFilesCount: number;
  urlCount: number;
}

export interface NotificationSubItem {
  notificationUuid: string;
  itemType: 'FILE' | 'URL';
  itemUuid: string;
  title: string;
  detailMessage: string | null;
  fileType: string | null;
  fileSizeBytes: number | null;
  visibility: 'PRIVATE' | 'PUBLIC';
  isRead: boolean;
  receivedAt: string;
}

export interface NotificationGroup {
  groupUuid: string;
  visibilityScope: 'PRIVATE' | 'PUBLIC';
  titleSummary: string;
  itemCount: number;
  isRead: boolean;
  firstReceivedAt: string;
  lastReceivedAt: string;
  items: NotificationSubItem[];
}

export interface AdminUserItem {
  id: number;
  userId: string;
  fullName: string;
  lineAliases?: string;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  mustChangePassword: boolean;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  createdAt: string;
  updatedAt: string;
  privateFileCount: number;
}

export interface SystemStatusData {
  serverTime: string;
  platform: string;
  storageRootPath: string;
  backupRootPath: string;
  disk: {
    freeBytes: number;
    usedBytes: number;
    totalBytes: number;
    minFreeRequiredBytes: number;
  };
  database: {
    filePath: string;
    sizeBytes: number;
  };
  counts: {
    userCount: number;
    activeUserCount: number;
    privateFileCount: number;
    publicFileCount: number;
    totalFileCount: number;
    totalStorageBytes: number;
    urlCount: number;
  };
  lineConfig: {
    hasChannelSecret: boolean;
    hasChannelAccessToken: boolean;
    allowedSenderLineUserId: string;
    recipientSyntaxMode: string;
  };
  backupSchedule: string;
  latestBackup: {
    backupId: string;
    backupType: string;
    status: string;
    dbSizeBytes: number;
    totalFilesCount: number;
    totalFilesBytes: number;
    startedAt: string;
    completedAt: string;
    errorMessage?: string | null;
  } | null;
}

export interface WebhookLogItem {
  id: number;
  webhookEventId: string;
  lineMessageId: string | null;
  senderLineUserId: string;
  eventType: string;
  messageType: string | null;
  processingStatus: string;
  isRedelivery: number;
  replyStatus: string;
  errorMessage: string | null;
  receivedAt: string;
  completedAt: string | null;
}

export interface BackupLogItem {
  id: number;
  backupId: string;
  backupType: string;
  targetPath: string;
  status: string;
  dbSizeBytes: number;
  totalFilesCount: number;
  totalFilesBytes: number;
  manifestSha256: string | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface SystemLogItem {
  id: number;
  level: string;
  category: string;
  action: string;
  actorUserId: string | null;
  ipAddress: string | null;
  detailsJson: string | null;
  createdAt: string;
}

