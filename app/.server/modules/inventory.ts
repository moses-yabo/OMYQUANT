import mongoose from "mongoose";
import { z } from "zod";
import * as db from "../database/models";
import { ApiError, id, quantity } from "../shared/http";
import { manage, owns, type Actor } from "../shared/access";

export async function placeOrder(actor: Actor, body: unknown) {
  const input = z
    .object({
      items: z
        .array(
          z
            .object({
              listing: id,
              kind: z.enum(["product", "livestock"]),
              quantity,
            })
            .strict(),
        )
        .min(1)
        .max(50),
      fulfilment: z.enum(["collection", "delivery"]),
    })
    .strict()
    .parse(body);
  return mongoose.connection.transaction(async (session) => {
    const items = [];
    let business = "";
    let total = 0;
    for (const item of input.items) {
      const model = item.kind === "product" ? db.Product : db.Livestock;
      const listing = await model.findOneAndUpdate(
        {
          _id: item.listing,
          status: "published",
          quantity: { $gte: item.quantity },
        },
        { $inc: { quantity: -item.quantity } },
        { new: true, session },
      );
      if (!listing)
        throw new ApiError(409, "Listing unavailable or insufficient stock");
      if (business && business !== String(listing.business))
        throw new ApiError(400, "Each order must contain a single seller");
      business = String(listing.business);
      if (
        !(await db.Business.exists({ _id: business, active: true }).session(
          session,
        ))
      )
        throw new ApiError(409, "Seller inactive");
      total += Number(listing.price) * item.quantity;
      if (!Number.isSafeInteger(total))
        throw new ApiError(400, "Order total exceeds supported range");
      items.push({ ...item, name: listing.name, unitPrice: listing.price });
    }
    return (
      await db.Order.create(
        [
          {
            customer: actor.id,
            business,
            items,
            total,
            fulfilment: input.fulfilment,
          },
        ],
        { session },
      )
    )[0];
  });
}
export async function bookSeats(actor: Actor, body: unknown) {
  const input = z
    .object({ departure: id, seats: quantity })
    .strict()
    .parse(body);
  return mongoose.connection.transaction(async (session) => {
    const departure = await db.Departure.findOneAndUpdate(
      {
        _id: input.departure,
        status: "scheduled",
        startsAt: { $gt: new Date() },
        remaining: { $gte: input.seats },
      },
      { $inc: { remaining: -input.seats } },
      { new: true, session },
    );
    if (!departure)
      throw new ApiError(409, "Departure unavailable or insufficient seats");
    return (
      await db.Booking.create(
        [
          {
            customer: actor.id,
            business: departure.business,
            departure: departure._id,
            seats: input.seats,
            unitPrice: departure.price,
          },
        ],
        { session },
      )
    )[0];
  });
}
export async function cancelBooking(actor: Actor, bookingId: string) {
  return mongoose.connection.transaction(async (session) => {
    const booking = await db.Booking.findById(bookingId).session(session);
    if (!booking) throw new ApiError(404, "Booking not found");
    owns(actor, booking.customer);
    if (booking.status !== "confirmed")
      throw new ApiError(409, "Booking already cancelled");
    const departure = await db.Departure.findOneAndUpdate(
      {
        _id: booking.departure,
        status: "scheduled",
        startsAt: { $gt: new Date() },
      },
      { $inc: { remaining: Number(booking.seats) } },
      { session },
    );
    if (!departure) throw new ApiError(409, "Departure no longer cancellable");
    booking.status = "cancelled";
    await booking.save({ session });
    return booking;
  });
}
export async function changeReservation(
  actor: Actor,
  reservationId: string,
  body: unknown,
) {
  const input = z
    .object({
      status: z.enum([
        "confirmed",
        "rejected",
        "cancelled",
        "picked_up",
        "returned",
      ]),
    })
    .strict()
    .parse(body);
  return mongoose.connection.transaction(async (session) => {
    const reservation =
      await db.Reservation.findById(reservationId).session(session);
    if (!reservation) throw new ApiError(404, "Reservation not found");
    if (input.status === "cancelled") owns(actor, reservation.customer);
    else await manage(actor, reservation.business, "trailer_rental");
    const allowed: Record<string, string[]> = {
      requested: ["confirmed", "rejected", "cancelled"],
      confirmed: ["cancelled", "picked_up"],
      picked_up: ["returned"],
    };
    if (!allowed[String(reservation.status)]?.includes(input.status))
      throw new ApiError(409, "Invalid reservation transition");
    // All confirmations write the same trailer: concurrent snapshots conflict and retry.
    const trailer = await db.Trailer.findOneAndUpdate(
      { _id: reservation.trailer, active: true },
      { $inc: { calendarVersion: 1 } },
      { session },
    );
    if (!trailer) throw new ApiError(409, "Trailer unavailable");
    if (
      input.status === "confirmed" &&
      (await db.Reservation.exists({
        _id: { $ne: reservation._id },
        trailer: reservation.trailer,
        status: { $in: ["confirmed", "picked_up"] },
        start: { $lt: reservation.end },
        end: { $gt: reservation.start },
      }).session(session))
    )
      throw new ApiError(409, "Trailer already reserved for this period");
    reservation.status = input.status;
    if (input.status === "picked_up") reservation.pickedUpAt = new Date();
    if (input.status === "returned") reservation.returnedAt = new Date();
    await reservation.save({ session });
    return reservation;
  });
}
