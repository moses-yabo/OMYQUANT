import { expect, test } from "@jest/globals";
import { createServer } from "node:http";
import { io as client } from "socket.io-client";
import { attachRealtime } from "../scripts/realtime.ts";
import {
  publishSupportChange,
  supportEvents,
} from "../scripts/support-events.ts";

function wait(socket, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${event}`)),
      4000,
    );
    socket.once(event, (value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}
test("support sockets authenticate, isolate reporters, reach both admin roles and recheck revoked roles", async () => {
  const server = createServer();
  const before = supportEvents.listenerCount("changed");
  const actors = {
    reporter: { id: "a".repeat(24), admin: false },
    other: { id: "b".repeat(24), admin: false },
    admin: { id: "c".repeat(24), admin: true },
    super: { id: "d".repeat(24), admin: true },
  };
  const io = attachRealtime(server, {
    async authenticateSupport(cookie) {
      if (!actors[cookie]) throw new Error("Unauthorized");
      return actors[cookie];
    },
  });
  const clients = [];
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}/support`;
    async function connect(cookie) {
      const socket = client(base, {
        forceNew: true,
        transports: ["websocket"],
        reconnection: false,
        autoConnect: false,
        extraHeaders: { Cookie: cookie },
      });
      clients.push(socket);
      const connected = wait(socket, "connect");
      socket.connect();
      await connected;
      return socket;
    }
    const reporter = await connect("reporter");
    const other = await connect("other");
    const admin = await connect("admin");
    const superAdmin = await connect("super");
    const outsiderEvents = [];
    other.on("support:refresh", (value) => outsiderEvents.push(value));
    const ticketId = "e".repeat(24);
    let incoming = [
      wait(reporter, "support:refresh"),
      wait(admin, "support:refresh"),
      wait(superAdmin, "support:refresh"),
    ];
    publishSupportChange({ ticketId, reporter: actors.reporter.id });
    for (const value of await Promise.all(incoming))
      expect(value).toEqual({ ticketId });
    expect(outsiderEvents).toEqual([]);

    const reporterEvents = [];
    reporter.on("support:refresh", (value) => reporterEvents.push(value));
    incoming = [
      wait(admin, "support:refresh"),
      wait(superAdmin, "support:refresh"),
    ];
    publishSupportChange({
      ticketId,
      reporter: actors.reporter.id,
      staffOnly: true,
    });
    await Promise.all(incoming);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(reporterEvents).toEqual([]);

    actors.admin.admin = false;
    const revokedEvents = [];
    admin.on("support:refresh", (value) => revokedEvents.push(value));
    const received = wait(superAdmin, "support:refresh");
    publishSupportChange({ ticketId, reporter: actors.reporter.id });
    await received;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(revokedEvents).toEqual([]);

    const anonymous = client(base, {
      forceNew: true,
      transports: ["websocket"],
      reconnection: false,
      autoConnect: false,
      auth: { room: "f".repeat(64) },
    });
    clients.push(anonymous);
    const denied = wait(anonymous, "connect_error");
    anonymous.connect();
    expect((await denied).message).toBe("Support authentication required");
  } finally {
    clients.forEach((socket) => socket.disconnect());
    await io.close();
    expect(supportEvents.listenerCount("changed")).toBe(before);
  }
});
