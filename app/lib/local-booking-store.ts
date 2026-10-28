export type LocalBooking = {
  _id: string;
  listing: string;
  kind: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  status: string;
  createdAt: string;
  start?: string;
  end?: string;
  seats?: number;
  description?: string;
  items?: { name: string; quantity: number }[];
};
export type BookingInput = {
  id: string;
  kind: string;
  quantity: number;
  start?: string;
  end?: string;
};
type CatalogItem = {
  id: string;
  kind: string;
  name: string;
  price: number;
  quantity: number;
};
const overlaps = (a: LocalBooking, start: string, end: string) =>
  ["confirmed", "picked_up"].includes(a.status) &&
  Date.parse(a.start!) < Date.parse(end) &&
  Date.parse(a.end!) > Date.parse(start);
export function readBookings(raw: string | null): LocalBooking[] {
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (
    !Array.isArray(value) ||
    !value.every(
      (b) =>
        b &&
        typeof b._id === "string" &&
        typeof b.listing === "string" &&
        typeof b.kind === "string" &&
        typeof b.status === "string" &&
        Number.isSafeInteger(b.quantity) &&
        b.quantity > 0 &&
        Number.isSafeInteger(b.total) &&
        b.total >= 0,
    )
  )
    throw new Error(
      "Saved local bookings are invalid. Export or clear the booking storage before trying again.",
    );
  return value;
}
export function available(listing: CatalogItem, bookings: LocalBooking[]) {
  return listing.kind === "trailers"
    ? 1
    : Math.max(
        0,
        listing.quantity -
          bookings
            .filter(
              (b) =>
                b.listing === listing.id &&
                !["cancelled", "rejected"].includes(b.status),
            )
            .reduce((sum, b) => sum + b.quantity, 0),
      );
}
export function addBooking(
  bookings: LocalBooking[],
  catalog: CatalogItem[],
  input: BookingInput,
  id: string,
  now = Date.now(),
) {
  const listing = catalog.find(
    (l) => l.id === input.id && l.kind === input.kind,
  );
  if (!listing) throw new Error("Local sample listing not found.");
  let units = input.quantity;
  if (listing.kind === "trailers") {
    const start = Date.parse(input.start ?? "");
    const end = Date.parse(input.end ?? "");
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start <= now ||
      end <= start
    )
      throw new Error(
        "Choose a future collection date and a later return date.",
      );
    if (
      bookings.some(
        (b) =>
          b.listing === listing.id && overlaps(b, input.start!, input.end!),
      )
    )
      throw new Error(
        "This trailer is already reserved for those dates in this browser.",
      );
    units = Math.ceil((end - start) / 86400000);
  } else if (
    !Number.isSafeInteger(units) ||
    units < 1 ||
    units > available(listing, bookings)
  )
    throw new Error(
      `Select between 1 and ${available(listing, bookings)} ${listing.kind === "taxis" ? "seats" : "units"}.`,
    );
  if (!Number.isSafeInteger(units * listing.price))
    throw new Error("Booking total exceeds the supported range.");
  const booking: LocalBooking = {
    _id: id,
    listing: listing.id,
    kind: listing.kind,
    name: listing.name,
    quantity: listing.kind === "trailers" ? 1 : units,
    unitPrice: listing.price,
    total: units * listing.price,
    status:
      listing.kind === "trailers"
        ? "requested"
        : listing.kind === "taxis"
          ? "confirmed"
          : "placed",
    createdAt: new Date(now).toISOString(),
    ...(listing.kind === "trailers"
      ? { start: input.start, end: input.end }
      : {}),
    ...(listing.kind === "taxis"
      ? { seats: units }
      : {
          items: [
            {
              name: listing.name,
              quantity: listing.kind === "trailers" ? 1 : units,
            },
          ],
        }),
  };
  return { booking, bookings: [...bookings, booking] };
}
export function changeBooking(
  bookings: LocalBooking[],
  id: string,
  status: string,
) {
  const booking = bookings.find((b) => b._id === id);
  if (!booking) throw new Error("Local booking not found.");
  const allowed: Record<string, string[]> = {
    requested: ["confirmed", "rejected", "cancelled"],
    confirmed: ["cancelled", "picked_up"],
    picked_up: ["returned"],
    placed: ["cancelled"],
  };
  if (
    !allowed[booking.status]?.includes(status) ||
    (status !== "cancelled" && booking.kind !== "trailers")
  )
    throw new Error("This status change is not available.");
  if (
    status === "confirmed" &&
    bookings.some(
      (b) =>
        b._id !== id &&
        b.listing === booking.listing &&
        overlaps(b, booking.start!, booking.end!),
    )
  )
    throw new Error("Another confirmed reservation overlaps these dates.");
  return bookings.map((b) => (b._id === id ? { ...b, status } : b));
}
