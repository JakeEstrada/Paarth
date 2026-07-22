import { io, type Socket } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

let socketInstance: Socket | null = null;

function getAuthToken() {
  return localStorage.getItem('accessToken') || '';
}

export function getSocket() {
  if (socketInstance) return socketInstance;

  socketInstance = io(API_URL, {
    autoConnect: false,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });

  return socketInstance;
}

/** Connect (or reconnect) with the current JWT — call after login / session restore. */
export function connectSocket() {
  const token = getAuthToken();
  if (!token) return;

  const socket = getSocket();
  socket.auth = { token };

  if (socket.connected) {
    socket.disconnect();
  }
  socket.connect();
}

export function disconnectSocket() {
  if (!socketInstance) return;
  socketInstance.disconnect();
  socketInstance = null;
}

export function getConnectedSocketId() {
  return socketInstance?.connected ? socketInstance.id || '' : '';
}

export function isSocketConnected() {
  return Boolean(socketInstance?.connected);
}
