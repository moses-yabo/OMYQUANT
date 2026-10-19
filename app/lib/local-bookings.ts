import { io, type Socket } from "socket.io-client";
import type { ServerEvents, ClientEvents } from '../../scripts/realtime';
import { samples } from "./marketplace";
import {
  addBooking,
  available,
  changeBooking,
  readBookings,
  type BookingInput,
} from "./local-booking-store";
export const storageKey = "omyquant.bookings.v1";
let socket: Socket<ServerEvents, ClientEvents> | undefined;
export function localHistory(accountId?: string | null) {
  if (!accountId) return [];
  return readBookings(localStorage.getItem(`${storageKey}:${accountId}`)).slice().reverse();
}
export function localListings(accountId?: string | null) {
  const bookings = localHistory(accountId);
  return samples.map((l) => ({ ...l, quantity: available(l, bookings) }));
}
async function write<T>(change: (key: string) => T) {
  const response = await fetch('/api/v1/users/me', { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error('Please sign in before creating or changing a booking.');
  const session = await response.json() as { data: { id: string } };
  if (!session.data?.id) throw new Error('Your account session is unavailable. Please sign in.');
  const key = `${storageKey}:${session.data.id}`;
  // Web Locks serializes read/validate/write across tabs sharing this origin.
  if (!navigator.locks)
    throw new Error(
      "Local booking requires a browser with Web Locks support. Open the app on localhost in a current browser.",
    );
  return navigator.locks.request(key, () => {
    const result = change(key);
    window.dispatchEvent(new Event("omyquant:bookings-changed"));
    if (socket?.connected) socket.volatile.emit("bookings:changed");
    return result;
  });
}
export async function bookLocal(input: BookingInput) {
  return write(key => {
    const { booking, bookings } = addBooking(
      readBookings(localStorage.getItem(key)),
      samples,
      input,
      crypto.randomUUID(),
    );
    localStorage.setItem(key, JSON.stringify(bookings));
    return booking;
  });
}
export async function updateLocal(id: string, status: string) {
  return write(key => {
    const bookings = changeBooking(
      readBookings(localStorage.getItem(key)),
      id,
      status,
    );
    localStorage.setItem(key, JSON.stringify(bookings));
  });
}
export function connectLocalRealtime(
  refresh: () => void,
  state: (connected: boolean) => void,
) {
  let room = localStorage.getItem("omyquant.realtime.v1");
  if (!room || !/^[a-f0-9]{64}$/.test(room)) {
    room = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    localStorage.setItem("omyquant.realtime.v1", room);
  }
  socket = io({ auth: { room }, reconnectionDelayMax: 5000 });
  const current = socket;
  const changed = () => refresh();
  const storage = (event: StorageEvent) => {
    if (event.key?.startsWith(storageKey + ':') || event.key === null) refresh();
  };
  current.on("connect", () => {
    state(true);
    refresh();
  });
  current.on("disconnect", () => state(false));
  current.on("connect_error", () => state(false));
  current.on("bookings:refresh", changed);
  window.addEventListener("storage", storage);
  window.addEventListener("omyquant:bookings-changed", changed);
  return () => {
    current.disconnect();
    if (socket === current) socket = undefined;
    window.removeEventListener("storage", storage);
    window.removeEventListener("omyquant:bookings-changed", changed);
  };
}
