import mongoose from "mongoose";
import { approvedBusinessFilter } from "../../lib/business-registry";
import { z } from "zod";
import * as db from "../database/models";
import { deliverySchema } from "../modules/resources";
import { manage, owns } from "../shared/access";
import { ApiError, id, money } from "../shared/http";
import type { ApiContext } from "./context";
import { json, body, list } from "./http";


export async function logisticsRoutes({ request, path, method, url, actor }: ApiContext): Promise<Response | undefined> {
  if (path === "logistics/requests" && method === "POST") {
    const input = deliverySchema.parse(await body(request));
    return json(
      await mongoose.connection.transaction(async (session) => {
        const order =
          input.order &&
          (await db.Order.findById(input.order).session(session));
        if (input.order) {
          if (!order) throw new ApiError(404, "Order not found");
          owns(actor, order.customer);
          if (
            order.fulfilment !== "delivery" ||
            order.deliveryRequest ||
            order.status === "cancelled"
          )
            throw new ApiError(409, "Order is not eligible for delivery");
          if (
            (order.items as { kind: string }[]).some(
              (x) => x.kind === "livestock",
            ) &&
            input.goodsType !== "livestock"
          )
            throw new ApiError(
              400,
              "Livestock requires specialist transportation",
            );
        }
        const [delivery] = await db.Delivery.create(
          [{ ...input, customer: actor.id }],
          { session },
        );
        if (order) {
          order.deliveryRequest = delivery._id;
          await order.save({ session });
        }
        return delivery;
      }),
      201,
    );
  }
  const quoteMatch = path.match(
    /^logistics\/requests\/([a-f0-9]{24})\/quotes$/i,
  );
  if (quoteMatch) {
    const delivery = await db.Delivery.findById(quoteMatch[1]);
    if (!delivery) throw new ApiError(404, "Delivery not found");
    if (method === "GET") {
      owns(actor, delivery.customer);
      return list(db.Quote, { request: delivery._id }, url);
    }
    if (method === "POST") {
      const input = z
        .object({
          business: id,
          price: money,
          capabilities: z
            .array(z.enum(["parcel", "agricultural", "livestock"]))
            .min(1),
        })
        .strict()
        .parse(await body(request));
      const company = await manage(actor, input.business, "logistics");
      if (company.logisticsProfile?.available === false)
        throw new ApiError(
          409,
          "This delivery service is currently unavailable",
        );
      if (!company.verified)
        throw new ApiError(403, "Verified logistics business required");
      if (
        delivery.status !== "requested" ||
        !input.capabilities.includes(
          delivery.goodsType as "parcel" | "agricultural" | "livestock",
        )
      )
        throw new ApiError(409, "Provider cannot quote for this request");
      return json(
        await db.Quote.create({ ...input, request: delivery._id }),
        201,
      );
    }
  }
  const acceptQuote = path.match(
    /^logistics\/quotes\/([a-f0-9]{24})\/accept$/i,
  );
  if (acceptQuote && method === "POST") {
    return json(
      await mongoose.connection.transaction(async (session) => {
        const quote = await db.Quote.findOne({
          _id: acceptQuote[1],
          status: "offered",
        }).session(session);
        if (!quote) throw new ApiError(404, "Quote unavailable");
        const delivery = await db.Delivery.findById(quote.request).session(
          session,
        );
        if (!delivery) throw new ApiError(404, "Delivery not found");
        owns(actor, delivery.customer);
        if (delivery.status !== "requested")
          throw new ApiError(409, "Delivery already assigned");
        if (
          !(await db.Business.exists({
            _id: quote.business,
            ...approvedBusinessFilter(),
            types: "logistics",
            "logisticsProfile.available": { $ne: false },
          }).session(session))
        )
          throw new ApiError(409, "Provider no longer eligible");
        delivery.business = quote.business;
        delivery.status = "assigned";
        quote.status = "accepted";
        await delivery.save({ session });
        await quote.save({ session });
        return delivery;
      }),
    );
  }
  const deliveryAssignment = path.match(
    /^logistics\/requests\/([a-f0-9]{24})\/assignment$/i,
  );
  if (deliveryAssignment && method === "PATCH") {
    const input = z
      .object({ vehicle: id, driver: id })
      .strict()
      .parse(await body(request));
    const delivery = await db.Delivery.findById(deliveryAssignment[1]);
    if (!delivery) throw new ApiError(404, "Delivery not found");
    await manage(actor, delivery.business, "logistics");
    if (
      !(await db.Vehicle.exists({
        _id: input.vehicle,
        business: delivery.business,
        active: { $ne: false },
      })) ||
      !(await db.Driver.exists({
        _id: input.driver,
        business: delivery.business,
        active: { $ne: false },
      }))
    )
      throw new ApiError(
        400,
        "Assign available personnel and vehicles from this business",
      );
    const assigned = await db.Delivery.findOneAndUpdate(
      { _id: delivery._id, business: delivery.business, status: "assigned" },
      { $set: input },
      { new: true },
    );
    if (!assigned)
      throw new ApiError(409, "Delivery can no longer be assigned");
    return json(assigned);
  }
  const deliveryStatus = path.match(
    /^logistics\/requests\/([a-f0-9]{24})\/status$/i,
  );
  if (deliveryStatus && method === "PATCH") {
    const input = z
      .object({
        status: z.enum(["collected", "delivered"]),
        proof: z.url().optional(),
      })
      .strict()
      .parse(await body(request));
    const delivery = await db.Delivery.findById(deliveryStatus[1]);
    if (!delivery) throw new ApiError(404, "Delivery not found");
    await manage(actor, delivery.business, "logistics");
    if (input.status === "delivered" && !input.proof)
      throw new ApiError(400, "Proof of delivery required");
    const result = await db.Delivery.findOneAndUpdate(
      {
        _id: delivery._id,
        status: input.status === "collected" ? "assigned" : "collected",
      },
      { $set: input },
      { new: true },
    );
    if (!result) throw new ApiError(409, "Invalid delivery transition");
    return json(result);
  }
}
