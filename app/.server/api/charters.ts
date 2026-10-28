import mongoose from "mongoose";
import { z } from "zod";
import * as db from "../database/models";
import { manage, owns } from "../shared/access";
import { ApiError, id, location, money, quantity, text } from "../shared/http";
import type { ApiContext } from "./context";
import { json, body, list } from "./http";


export async function charterRoutes({ request, path, method, url, actor }: ApiContext): Promise<Response | undefined> {
  if (path === "business-transport/requests" && method === "POST") {
    const input = z
      .object({
        kind: z.enum(["staff", "charter", "private_minibus"]),
        passengers: quantity,
        pickup: location,
        dropoff: location,
        startsAt: z.coerce.date().min(new Date()),
      })
      .strict()
      .parse(await body(request));
    return json(
      await db.TransportRequest.create({ ...input, customer: actor.id }),
      201,
    );
  }
  const charterQuote = path.match(
    /^business-transport\/requests\/([a-f0-9]{24})\/quotes$/i,
  );
  if (charterQuote) {
    const trip = await db.TransportRequest.findById(charterQuote[1]);
    if (!trip) throw new ApiError(404, "Transport request not found");
    if (method === "GET") {
      owns(actor, trip.customer);
      return list(db.TransportQuote, { request: trip._id }, url);
    }
    if (method === "POST") {
      const input = z
        .object({ business: id, price: money, description: text })
        .strict()
        .parse(await body(request));
      await manage(actor, input.business, "commercial_transport");
      if (trip.status !== "requested")
        throw new ApiError(409, "Transport request already assigned");
      return json(
        await db.TransportQuote.create({ ...input, request: trip._id }),
        201,
      );
    }
  }
  const charterAccept = path.match(
    /^business-transport\/quotes\/([a-f0-9]{24})\/accept$/i,
  );
  if (charterAccept && method === "POST") {
    return json(
      await mongoose.connection.transaction(async (session) => {
        const quote = await db.TransportQuote.findOne({
          _id: charterAccept[1],
          status: "offered",
        }).session(session);
        if (!quote) throw new ApiError(404, "Quote not found");
        const trip = await db.TransportRequest.findById(
          quote.request,
        ).session(session);
        if (!trip) throw new ApiError(404, "Transport request not found");
        owns(actor, trip.customer);
        if (trip.status !== "requested")
          throw new ApiError(409, "Transport request already assigned");
        if (
          !(await db.Business.exists({
            _id: quote.business,
            active: true,
            types: "commercial_transport",
            verified: true,
          }).session(session))
        )
          throw new ApiError(409, "Transport provider unavailable");
        trip.status = "assigned";
        quote.status = "accepted";
        await trip.save({ session });
        await quote.save({ session });
        return quote;
      }),
    );
  }
}
