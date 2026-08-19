import { io, type Socket } from 'socket.io-client';

function socketServerUrl() {
  return String(import.meta.env.VITE_API_URL || 'http://localhost:4000')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api$/i, '');
}

let socketInstance: Socket | null = null;
let currentToken = '';

/**
 * Rooms are shared by every subscriber on screen, so track how many are interested.
 * Without this, one component unmounting left the room for all the others.
 */
const roomSubscriberCounts = new Map<string, number>();

function getAuthToken() {
  return localStorage.getItem('accessToken') || '';
}

export function getTenantRoom(raw: unknown): string | null {
  const value =
    typeof raw === 'object' && raw !== null && '_id' in raw
      ? String((raw as { _id: unknown })._id)
      : String(raw || '').trim();
  if (!/^[a-fA-F0-9]{24}$/.test(value)) return null;
  return `tenant:${value}`;
}

export function getSocket() {
  if (socketInstance) return socketInstance;

  socketInstance = io(socketServerUrl(), {
    autoConnect: false,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });

  socketInstance.on('connect', () => {
    resubscribeRooms();
  });

  return socketInstance;
}

/**
 * Connect (or reconnect) with the current JWT — call after login / session restore.
 * Safe to call repeatedly: it only tears down a live connection when the token
 * actually changed, since every reconnect drops room membership for all subscribers.
 */
export function connectSocket() {
  const token = getAuthToken();
  if (!token) return;

  const socket = getSocket();
  const tokenChanged = currentToken !== token;
  currentToken = token;
  socket.auth = { token };

  if (socket.connected) {
    if (!tokenChanged) return;
    socket.disconnect();
  }
  socket.connect();
}

export function disconnectSocket() {
  currentToken = '';
  roomSubscriberCounts.clear();
  if (!socketInstance) return;
  socketInstance.disconnect();
  socketInstance = null;
}

/** Join a room, or note one more interested subscriber if already joined. */
export function joinRoom(room: string) {
  const topic = String(room || '').trim();
  if (!topic) return;

  const next = (roomSubscriberCounts.get(topic) || 0) + 1;
  roomSubscriberCounts.set(topic, next);
  if (next === 1) {
    getSocket().emit('subscribe', topic);
  }
}

/** Release one subscriber's interest, leaving the room only when it hits zero. */
export function leaveRoom(room: string) {
  const topic = String(room || '').trim();
  if (!topic) return;

  const next = (roomSubscriberCounts.get(topic) || 0) - 1;
  if (next > 0) {
    roomSubscriberCounts.set(topic, next);
    return;
  }

  roomSubscriberCounts.delete(topic);
  if (socketInstance?.connected) {
    socketInstance.emit('unsubscribe', topic);
  }
}

/** Re-join every active room after a reconnect. */
export function resubscribeRooms() {
  if (roomSubscriberCounts.size === 0) return;
  const socket = getSocket();
  roomSubscriberCounts.forEach((_count, topic) => {
    socket.emit('subscribe', topic);
  });
}

export function getConnectedSocketId() {
  return socketInstance?.connected ? socketInstance.id || '' : '';
}

export function isSocketConnected() {
  return Boolean(socketInstance?.connected);
}
