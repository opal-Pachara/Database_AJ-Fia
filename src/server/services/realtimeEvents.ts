import { Response } from 'express';

export interface RealtimeEventPayload {
  type: 'FILE_RECEIVED' | 'URL_RECEIVED' | 'FILE_UPDATED' | 'FILE_DELETED';
  itemUuid: string;
  title: string;
  fileCategory?: string;
  visibility: 'PRIVATE' | 'PUBLIC';
  recipientUserIds?: string[];
  attachedMessage?: string | null;
  fileSizeBytes?: number | null;
  timestamp: string;
}

interface ConnectedClient {
  clientId: string;
  userPk: number;
  userId: string;
  role: 'USER' | 'ADMIN';
  res: Response;
  heartbeatTimer: NodeJS.Timeout;
}

const clients = new Map<string, ConnectedClient>();

/**
 * Registers an authenticated SSE client stream.
 */
export function registerRealtimeClient(params: {
  clientId: string;
  userPk: number;
  userId: string;
  role: 'USER' | 'ADMIN';
  res: Response;
}): () => void {
  const { clientId, userPk, userId, role, res } = params;

  const heartbeatTimer = setInterval(() => {
    try {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    } catch {
      removeClient(clientId);
    }
  }, 20000);

  clients.set(clientId, {
    clientId,
    userPk,
    userId,
    role,
    res,
    heartbeatTimer,
  });

  return () => {
    removeClient(clientId);
  };
}

function removeClient(clientId: string): void {
  const existing = clients.get(clientId);
  if (existing) {
    clearInterval(existing.heartbeatTimer);
    clients.delete(clientId);
  }
}

/**
 * Broadcasts a real-time event immediately to all authorized connected browsers.
 * - PUBLIC items are sent to everyone.
 * - PRIVATE items are sent only to matching recipientUserIds and ADMIN accounts.
 */
export function broadcastRealtimeEvent(event: RealtimeEventPayload): void {
  if (clients.size === 0) return;

  const targetLowerSet = new Set(
    (event.recipientUserIds || []).map((id) => id.trim().toLowerCase()).filter(Boolean)
  );

  const serialized = `data: ${JSON.stringify(event)}\n\n`;

  for (const [clientId, client] of clients.entries()) {
    const canReceive =
      client.role === 'ADMIN' ||
      event.visibility === 'PUBLIC' ||
      targetLowerSet.has(client.userId.toLowerCase());

    if (!canReceive) continue;

    try {
      client.res.write(serialized);
    } catch {
      removeClient(clientId);
    }
  }
}

