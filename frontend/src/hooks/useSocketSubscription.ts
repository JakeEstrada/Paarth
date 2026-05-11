import { useEffect } from 'react';
import { getSocket } from '../services/socket';

export function useSocketSubscription(room, event, handler) {
  useEffect(() => {
    if (!room || !event || typeof handler !== 'function') return undefined;

    const socket = getSocket();
    const topic = String(room).trim();
    if (!topic) return undefined;

    socket.emit('subscribe', topic);
    socket.on(event, handler);

    return () => {
      socket.off(event, handler);
      socket.emit('unsubscribe', topic);
    };
  }, [room, event, handler]);
}
