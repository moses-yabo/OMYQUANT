import mongoose from "mongoose";
import { z } from "zod";
import * as db from "../database/models";
import { manage } from "../shared/access";
import { TAXI_PASSENGER_CAPACITY } from "../../lib/taxi-capacity";
import { ApiError, id, money } from "../shared/http";
import type { ApiContext } from "./context";
import { json, body, list } from "./http";


export async function departureRoutes({ request, path, method, url, actor }: ApiContext): Promise<Response | undefined> {
  if (path === "transport/departures") {
    if (method === "GET") {
      const business = id.parse(url.searchParams.get("business"));
      await manage(actor, business, "taxi_operator", false, "read");
      return list(db.Departure, { business }, url);
    }
    if (method === "POST") {
      const input = z
        .object({
          business: id,
          vehicle: id,
          route: id,
          startsAt: z.coerce.date().min(new Date()),
          price: money,
        })
        .strict()
        .parse(await body(request));
      await manage(actor, input.business, "taxi_operator");
      const departure = await mongoose.connection.transaction(
        async (session) => {
          // Serialize scheduling for this vehicle so one taxi cannot acquire
          // multiple seat pools at the same departure time.
          const vehicle = await db.Vehicle.findOneAndUpdate(
            { _id: input.vehicle, business: input.business },
            { $inc: { scheduleVersion: 1 } },
            { new: true, session },
          );
          if (
            !vehicle ||
            vehicle.active === false ||
            !(await db.Route.exists({
              _id: input.route,
              business: input.business,
            }).session(session))
          )
            throw new ApiError(
              400,
              "Vehicle and route must belong to business and be available",
            );
          if (
            await db.Departure.exists({
              vehicle: input.vehicle,
              startsAt: input.startsAt,
              status: { $ne: "cancelled" },
            }).session(session)
          )
            throw new ApiError(
              409,
              "This taxi is already scheduled at that time. Select another vehicle.",
            );
          const capacity = Math.min(
            Number(vehicle.capacity),
            TAXI_PASSENGER_CAPACITY,
          );
          if (!Number.isInteger(capacity) || capacity < 1)
            throw new ApiError(
              400,
              "Vehicle needs a valid passenger capacity",
            );
          return (
            await db.Departure.create(
              [{ ...input, capacity, remaining: capacity }],
              { session },
            )
          )[0];
        },
      );
      return json(departure, 201);
    }
  }
}

export async function tripRoutes({ request, path, method, actor }: ApiContext): Promise<Response | undefined> {
  const tripStatus = path.match(
    /^transport\/departures\/([a-f0-9]{24})\/status$/i,
  );
  if (tripStatus && method === "PATCH") {
    const input = z
      .object({ status: z.enum(["departed", "completed", "cancelled"]) })
      .strict()
      .parse(await body(request));
    const departure = await db.Departure.findById(tripStatus[1]);
    if (!departure) throw new ApiError(404, "Departure not found");
    await manage(actor, departure.business, "taxi_operator");
    const allowed: Record<string, string[]> = {
      scheduled: ["departed", "cancelled"],
      departed: ["completed"],
    };
    if (!allowed[String(departure.status)]?.includes(input.status))
      throw new ApiError(409, "Invalid trip transition");
    const result = await db.Departure.findOneAndUpdate(
      { _id: departure._id, status: departure.status },
      { $set: input },
      { new: true },
    );
    if (!result) throw new ApiError(409, "Trip changed; retry");
    return json(result);
  }
}
