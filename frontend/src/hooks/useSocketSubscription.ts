import { useEffect, useState } from 'react';
import { connectSocket, getSocket } from '../services/socket';

export function useSocketSubscription(
  room: string | null | undefined,
  event: string,
  handler: (...args: unknown[]) => void,
) {
  useEffect(() => {
    if (!room || !event || typeof handler !== 'function') return undefined;

    const topic = String(room).trim();
    if (!topic) return undefined;

    connectSocket();
    const socket = getSocket();

    const subscribe = () => {
      socket.emit('subscribe', topic);
    };

    subscribe();
    socket.on('connect', subscribe);
    socket.on(event, handler);

    return () => {
      socket.off('connect', subscribe);
      socket.off(event, handler);
      socket.emit('unsubscribe', topic);
    };
  }, [room, event, handler]);
}

export function useSocketConnectionStatus(): boolean {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    connectSocket();
    const socket = getSocket();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    setConnected(socket.connected);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  return connected;
}
