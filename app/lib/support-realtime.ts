import { io } from "socket.io-client";

export function connectSupport(
  onChange: (ticketId: string) => void,
  onConnection: (connected: boolean) => void = () => {},
) {
  const socket = io("/support", { forceNew: true, withCredentials: true });
  socket.on("connect", () => {
    onConnection(true);
    onChange("");
  });
  socket.on("disconnect", () => onConnection(false));
  socket.on("connect_error", () => onConnection(false));
  socket.on("support:refresh", (event: unknown) => {
    if (
      event &&
      typeof event === "object" &&
      "ticketId" in event &&
      typeof event.ticketId === "string" &&
      /^[a-f0-9]{24}$/i.test(event.ticketId)
    )
      onChange(event.ticketId);
  });
  return () => {
    socket.disconnect();
  };
}
