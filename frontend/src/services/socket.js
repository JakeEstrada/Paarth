import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

let socketInstance = null;

function getAuthToken() {
  return localStorage.getItem('accessToken') || '';
}

export function getSocket() {
  if (socketInstance) return socketInstance;

  socketInstance = io(API_URL, {
    autoConnect: true,
    transports: ['websocket', 'polling'],
    auth: (cb) => {
      cb({ token: getAuthToken() });
    },
  });

  return socketInstance;
}

export function disconnectSocket() {
  if (!socketInstance) return;
  socketInstance.disconnect();
  socketInstance = null;
}
