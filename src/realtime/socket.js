/**
 * Realtime (Socket.IO) — attached to the same HTTP server as Express.
 * Rooms:
 *   provider-{providerId}
 *   customer-{customerId}
 *   admin
 *
 * Client events:
 *   join-provider-room (providerId)
 *   join-customer-room (customerId)
 *   join-admin-room
 *
 * Server → client events:
 *   new-booking
 *   service-completed
 *   new-service-request (admins)
 *   room-joined / customer-room-joined / admin-room-joined
 *
 * HTTP (compat with existing apps):
 *   POST /emit-booking
 *   POST /emit-service-completed
 */

const {Server} = require('socket.io');
const {verifyAccessToken} = require('../utils/jwtAuth');
const {parseCorsOrigins} = require('../config/cors');

let io = null;

const ADMIN_ROOM = 'admin';

function getAllowedOrigins() {
  return parseCorsOrigins();
}

/**
 * Attach Socket.IO to an http.Server (long-lived process only).
 * No-op on Vercel serverless — use HTTP emit fallback or a persistent host.
 */
function initSocket(httpServer) {
  if (!httpServer) {
    console.warn('⚠️ [realtime] No HTTP server — Socket.IO not started');
    return null;
  }
  if (io) return io;

  io = new Server(httpServer, {
    path: '/socket.io/',
    cors: {
      origin: getAllowedOrigins(),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    const queryProviderId = socket.handshake.query?.providerId;
    if (queryProviderId && typeof queryProviderId === 'string') {
      const room = `provider-${queryProviderId}`;
      socket.join(room);
      socket.emit('room-joined', {
        room,
        roomSize: io.sockets.adapter.rooms.get(room)?.size || 1,
      });
    }

    const clientType = socket.handshake.query?.clientType;
    if (clientType === 'admin') {
      socket.join(ADMIN_ROOM);
      socket.emit('admin-room-joined', {
        room: ADMIN_ROOM,
        roomSize: io.sockets.adapter.rooms.get(ADMIN_ROOM)?.size || 1,
      });
    }

    socket.on('join-provider-room', (providerId) => {
      if (!providerId) return;
      const room = `provider-${String(providerId)}`;
      socket.join(room);
      socket.emit('room-joined', {
        room,
        roomSize: io.sockets.adapter.rooms.get(room)?.size || 1,
      });
    });

    socket.on('join-customer-room', (customerId) => {
      if (!customerId) return;
      const room = `customer-${String(customerId)}`;
      socket.join(room);
      socket.emit('customer-room-joined', {
        room,
        customerId: String(customerId),
        roomSize: io.sockets.adapter.rooms.get(room)?.size || 1,
      });
    });

    socket.on('join-admin-room', () => {
      socket.join(ADMIN_ROOM);
      socket.emit('admin-room-joined', {
        room: ADMIN_ROOM,
        roomSize: io.sockets.adapter.rooms.get(ADMIN_ROOM)?.size || 1,
      });
    });

    socket.on('disconnect', () => {
      // rooms cleaned automatically
    });
  });

  console.log('🔌 Socket.IO attached (path /socket.io/)');
  return io;
}

function getIO() {
  return io;
}

function emitToProvider(providerId, event, payload) {
  if (!io || !providerId) return false;
  io.to(`provider-${String(providerId)}`).emit(event, payload);
  return true;
}

function emitToCustomer(customerId, event, payload) {
  if (!io || !customerId) return false;
  io.to(`customer-${String(customerId)}`).emit(event, payload);
  return true;
}

function emitToAdmins(event, payload) {
  if (!io) return false;
  io.to(ADMIN_ROOM).emit(event, payload);
  return true;
}

/**
 * Emit new booking to a provider room (and optionally customer status events).
 */
function emitBooking({providerId, customerId, bookingData}) {
  let emitted = false;
  if (providerId) {
    emitted = emitToProvider(providerId, 'new-booking', bookingData) || emitted;
  }
  if (customerId && bookingData?.type === 'service-request-status') {
    emitted =
      emitToCustomer(customerId, 'service-request-status', bookingData) ||
      emitted;
  }
  return emitted;
}

function emitServiceCompleted({
  customerId,
  jobCardId,
  consultationId,
  providerName,
  serviceType,
}) {
  if (!customerId) return false;
  return emitToCustomer(customerId, 'service-completed', {
    jobCardId,
    consultationId,
    providerName,
    serviceType,
  });
}

function emitNewServiceRequest(payload) {
  return emitToAdmins('new-service-request', payload);
}

function emitSecret() {
  return process.env.WEBSOCKET_EMIT_SECRET || process.env.JWT_SECRET || '';
}

function emitAuthHeaders() {
  const secret = emitSecret();
  return secret ? {'x-emit-secret': secret} : {};
}

function allowEmitRequest(req) {
  const secret = emitSecret();
  if (secret && req.headers['x-emit-secret'] === secret) {
    return true;
  }
  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Bearer ')) return false;
  try {
    verifyAccessToken(auth.slice(7).trim());
    return true;
  } catch {
    return false;
  }
}

function rejectUnauthorizedEmit(res) {
  return res.status(401).json({
    success: false,
    error: 'Unauthorized',
    message: 'Authentication required',
  });
}

async function notifyBooking(payload) {
  const {providerId, customerId, bookingData} = payload || {};
  const localOk = emitBooking({providerId, customerId, bookingData});
  if (localOk) return {ok: true, via: 'local'};

  const remote = process.env.WEBSOCKET_SERVER_URL;
  if (!remote) {
    return {ok: false, via: 'none', reason: 'no_socket_and_no_remote'};
  }
  try {
    const axios = require('axios');
    await axios.post(
      `${remote.replace(/\/$/, '')}/emit-booking`,
      {providerId, customerId, bookingData},
      {timeout: 5000, headers: emitAuthHeaders()},
    );
    return {ok: true, via: 'remote'};
  } catch (err) {
    return {ok: false, via: 'remote', reason: err.message};
  }
}

/**
 * Emit the same booking payload to many provider rooms (area broadcast).
 */
async function notifyAreaProviders({
  providers,
  bookingData,
  excludeProviderId,
}) {
  const list = Array.isArray(providers) ? providers : [];
  if (!list.length || !bookingData) {
    return {notified: 0, skipped: 0};
  }

  let notified = 0;
  let skipped = 0;
  const exclude = excludeProviderId ? String(excludeProviderId) : '';

  await Promise.all(
    list.map(async (provider) => {
      const providerId = String(provider?._id || provider?.id || provider || '');
      if (!providerId || (exclude && providerId === exclude)) {
        skipped += 1;
        return;
      }
      try {
        await notifyBooking({providerId, bookingData});
        notified += 1;
      } catch (err) {
        console.warn(
          `⚠️ [realtime] Area notify provider ${providerId}:`,
          err.message,
        );
      }
    }),
  );

  return {notified, skipped};
}

async function notifyServiceCompleted(payload) {
  const localOk = emitServiceCompleted(payload || {});
  if (localOk) return {ok: true, via: 'local'};

  const remote = process.env.WEBSOCKET_SERVER_URL;
  if (!remote) {
    return {ok: false, via: 'none', reason: 'no_socket_and_no_remote'};
  }
  try {
    const axios = require('axios');
    await axios.post(
      `${remote.replace(/\/$/, '')}/emit-service-completed`,
      payload,
      {timeout: 5000, headers: emitAuthHeaders()},
    );
    return {ok: true, via: 'remote'};
  } catch (err) {
    return {ok: false, via: 'remote', reason: err.message};
  }
}

async function notifyAdminsRealtime(payload) {
  const localOk = emitNewServiceRequest(payload);
  if (localOk) return {ok: true, via: 'local'};
  return {ok: false, via: 'none', reason: 'no_socket'};
}

function mountEmitHttpRoutes(app) {
  app.post('/emit-booking', (req, res) => {
    if (!allowEmitRequest(req)) return rejectUnauthorizedEmit(res);
    try {
      const {providerId, doctorId, customerId, bookingData} = req.body || {};
      const targetProviderId = providerId || doctorId;
      if (!bookingData || (!targetProviderId && !customerId)) {
        return res.status(400).json({
          success: false,
          error:
            'bookingData and providerId (or customerId) are required',
        });
      }
      const ok = emitBooking({
        providerId: targetProviderId,
        customerId,
        bookingData,
      });
      return res.json({
        success: true,
        emitted: ok,
        message: ok
          ? 'Emitted'
          : 'No connected sockets (clients will rely on polling)',
      });
    } catch (err) {
      return res.status(500).json({success: false, error: err.message});
    }
  });

  app.post('/emit-service-completed', (req, res) => {
    if (!allowEmitRequest(req)) return rejectUnauthorizedEmit(res);
    try {
      const ok = emitServiceCompleted(req.body || {});
      return res.json({
        success: true,
        emitted: ok,
        message: ok
          ? 'Emitted'
          : 'No connected sockets (clients will rely on polling)',
      });
    } catch (err) {
      return res.status(500).json({success: false, error: err.message});
    }
  });
}

module.exports = {
  initSocket,
  getIO,
  emitToProvider,
  emitToCustomer,
  emitToAdmins,
  emitBooking,
  emitServiceCompleted,
  emitNewServiceRequest,
  notifyBooking,
  notifyAreaProviders,
  notifyServiceCompleted,
  notifyAdminsRealtime,
  mountEmitHttpRoutes,
};
