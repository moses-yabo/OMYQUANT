import { Server } from "socket.io";
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
      if (Date.now() - last < 100) return;
      last = Date.now();
      socket.to(room).emit("bookings:refresh");
    });
  });
  return io;
}
