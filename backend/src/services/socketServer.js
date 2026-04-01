const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

function parseAllowedOrigins() {
  const raw = process.env.CORS_ORIGINS;
  if (!raw || !String(raw).trim()) return true;
  const list = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : true;
}

function canJoinRoom(socket, room) {
  if (!room || typeof room !== 'string') return false;
  const value = room.trim();
  if (!value) return false;

  // Allowed room patterns:
  // - tenant:<tenantId>
  // - project:<projectId>
  // - task:<taskId>
  // - user:<userId> (restricted to self when userId is available)
  if (/^(tenant|project|task|user):[a-zA-Z0-9_-]+$/.test(value) === false) return false;

  if (value.startsWith('user:')) {
    const requestedUserId = value.slice('user:'.length);
    if (!socket.data?.userId) return false;
    return String(socket.data.userId) === String(requestedUserId);
  }

  return true;
}

function socketAuthMiddleware(socket, next) {
  try {
    const token =
      socket.handshake?.auth?.token ||
      socket.handshake?.headers?.authorization?.replace(/^Bearer\s+/i, '') ||
      null;

    if (!token || !process.env.JWT_SECRET) {
      return next();
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    socket.data.userId = payload?.userId || payload?.id || null;
    socket.data.tenantId = payload?.tenantId || null;
    return next();
  } catch (error) {
    // Keep socket usable for non-authenticated, non-sensitive subscriptions.
    return next();
  }
}

function initializeSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: parseAllowedOrigins(),
      methods: ['GET', 'POST'],
      credentials: false,
    },
  });

  io.use(socketAuthMiddleware);

  io.on('connection', (socket) => {
    console.log('[socket] connected:', socket.id);

    socket.on('subscribe', (topic) => {
      if (!canJoinRoom(socket, topic)) return;
      socket.join(topic);
    });

    socket.on('unsubscribe', (topic) => {
      if (!topic || typeof topic !== 'string') return;
      socket.leave(topic.trim());
    });

    socket.on('disconnect', () => {
      console.log('[socket] disconnected:', socket.id);
    });
  });

  return io;
}

module.exports = {
  initializeSocketServer,
};
