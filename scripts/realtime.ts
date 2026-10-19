import { Server } from "socket.io";
import { localAuthEnabled, authenticateLocalCookie } from './local-auth.js';
export interface ClientEvents {
  "bookings:changed": () => void;
}
export interface ServerEvents {
  "bookings:refresh": () => void;
}
interface SocketData {
  room: string;
}
export function attachRealtime(server: Parameters<Server["attach"]>[0]) {
  const io = new Server<
    ClientEvents,
    ServerEvents,
    Record<string, never>,
    SocketData
  >(server, {
    maxHttpBufferSize: 4096,
    serveClient: false,
    destroyUpgrade: false,
    allowRequest(req, done) {
      const origin = req.headers.origin;
      if (!origin) return done(null, true);
      try {
        done(
          null,
          process.env.APP_ORIGIN
            ? origin === process.env.APP_ORIGIN
            : new URL(origin).host === req.headers.host,
        );
      } catch {
        done(null, false);
      }
    },
  });
  io.use(async (socket, next) => {
    if (localAuthEnabled()) {
      try { const session = await authenticateLocalCookie(socket.request.headers.cookie); socket.data.room = `user:${session.user.id}`; return next(); }
      catch { return next(new Error('Sign in to receive booking updates.')); }
    }
    const room: unknown = socket.handshake.auth?.room;
    if (typeof room !== "string" || !/^[a-f0-9]{64}$/.test(room))
      return next(new Error("Invalid local booking room"));
    socket.data.room = room;
    next();
  });
  io.on("connection", (socket) => {
    const room = `local:${socket.data.room}`;
    socket.join(room);
    let last = 0;
    socket.on("bookings:changed", async () => {
      if (localAuthEnabled()) {
        try { await authenticateLocalCookie(socket.request.headers.cookie); } catch { socket.disconnect(true); return; }
      }
      if (Date.now() - last < 100) return;
      last = Date.now();
      if (localAuthEnabled()) {
        const peers = await io.in(room).fetchSockets();
        for (const peer of peers) {
          if (peer.id === socket.id) continue;
          try { await authenticateLocalCookie(peer.handshake.headers.cookie); peer.emit('bookings:refresh'); }
          catch { peer.disconnect(true); }
        }
        return;
      }
      socket.to(room).emit("bookings:refresh");
    });
  });
  return io;
}
