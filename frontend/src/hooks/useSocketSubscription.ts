import { useEffect, useRef, useState } from 'react';
import {
  connectSocket,
  getConnectedSocketId,
  getSocket,
  joinRoom,
  leaveRoom,
  resubscribeRooms,
} from '../services/socket';

/** Events that mean "job or schedule data this page renders may have changed". */
export const TENANT_DATA_EVENTS = [
  'project.created',
  'project.updated',
  'task.created',
  'task.updated',
  'appointment.changed',
  'customer.changed',
];

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

    joinRoom(topic);
    const onConnect = () => {
      resubscribeRooms();
    };
    socket.on('connect', onConnect);
    socket.on(event, handler);

    return () => {
      socket.off('connect', onConnect);
      socket.off(event, handler);
      leaveRoom(topic);
    };
  }, [room, event, handler]);
}

type TenantRefreshOptions = {
  /** Defaults to TENANT_DATA_EVENTS. */
  events?: string[];
  enabled?: boolean;
  /** Ignore events this tab caused — the originating screen already updated itself. */
  ignoreOwnWrites?: boolean;
  debounceMs?: number;
};

/**
 * Reload a list page when tenant data changes in another tab or by another user.
 * A burst of events collapses into one refresh, and `refresh` may be an inline
 * function — it is read from a ref rather than resubscribing on every render.
 */
export function useTenantRealtimeRefresh(
  room: string | null | undefined,
  refresh: () => void,
  options: TenantRefreshOptions = {},
) {
  const { enabled = true, ignoreOwnWrites = true, debounceMs = 400 } = options;
  const events = options.events || TENANT_DATA_EVENTS;
  const eventKey = events.join('|');

  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    const topic = String(room || '').trim();
    const eventNames = eventKey.split('|').filter(Boolean);
    if (!enabled || !topic || eventNames.length === 0) return undefined;

    connectSocket();
    const socket = getSocket();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const handleEvent = (payload: unknown) => {
      const sourceSocketId = (payload as { sourceSocketId?: string } | null)?.sourceSocketId;
      if (ignoreOwnWrites && sourceSocketId && sourceSocketId === getConnectedSocketId()) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        refreshRef.current?.();
      }, debounceMs);
    };

    joinRoom(topic);
    const onConnect = () => {
      resubscribeRooms();
    };
    socket.on('connect', onConnect);
    eventNames.forEach((name) => socket.on(name, handleEvent));

    return () => {
      if (timer) clearTimeout(timer);
      socket.off('connect', onConnect);
      eventNames.forEach((name) => socket.off(name, handleEvent));
      leaveRoom(topic);
    };
  }, [room, eventKey, enabled, ignoreOwnWrites, debounceMs]);
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
