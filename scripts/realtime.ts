import { Server } from "socket.io";
import { supportEvents, type SupportChange } from "./support-events.js";
export interface ClientEvents {
  "bookings:changed": () => void;
}
export interface ServerEvents {
  "support:refresh": (event: { ticketId: string }) => void;
  "bookings:refresh": () => void;
}
interface SocketData {
  room: string;
}
export function attachRealtime(
  server: Parameters<Server["attach"]>[0],
  options: {
    authenticateSupport?: (
      cookie: string,
    ) => Promise<{ id: string; admin: boolean }>;
  } = {},
) {
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
  // Separate namespace: demo room tokens never authenticate support access.
  const support = io.of("/support");
  support.use(async (socket, next) => {
    try {
      if (!options.authenticateSupport) throw new Error("Unavailable");
      await options.authenticateSupport(socket.handshake.headers.cookie ?? "");
      next();
    } catch {
      next(new Error("Support authentication required"));
    }
  });
  const changed = (event: SupportChange) => {
    void Promise.allSettled(
      [...support.sockets.values()].map(async (socket) => {
        try {
          // Recheck the current session/role before each delivery, including role revocations.
          const actor = await options.authenticateSupport!(
            socket.handshake.headers.cookie ?? "",
          );
          if (actor.admin || (!event.staffOnly && actor.id === event.reporter))
            socket.emit("support:refresh", { ticketId: event.ticketId });
        } catch {
          socket.disconnect(true);
        }
      }),
    );
  };
  supportEvents.on("changed", changed);
  const close = io.close.bind(io);
  io.close = (...args) => {
    supportEvents.off("changed", changed);
    return close(...args);
  };
  return io;
}
