import mongoose from "mongoose";
import { z } from "zod";
import * as db from "../database/models";
import { manage, owns } from "../shared/access";
import { ApiError } from "../shared/http";
import type { ApiContext } from "./context";
import { json, body } from "./http";


export async function orderRoutes({ request, path, method, actor }: ApiContext): Promise<Response | undefined> {
  const orderStatus = path.match(
    /^farming\/orders\/([a-f0-9]{24})\/status$/i,
  );
  if (orderStatus && method === "PATCH") {
    const input = z
      .object({ status: z.enum(["accepted", "fulfilled", "cancelled"]) })
      .strict()
      .parse(await body(request));
    return json(
      await mongoose.connection.transaction(async (session) => {
        const order = await db.Order.findById(orderStatus[1]).session(
          session,
        );
        if (!order) throw new ApiError(404, "Order not found");
        if (
          input.status === "cancelled" &&
          String(order.customer) === actor.id
        )
          owns(actor, order.customer);
        else await manage(actor, order.business, "farm");
        const allowed: Record<string, string[]> = {
          placed: ["accepted", "cancelled"],
          accepted: ["fulfilled", "cancelled"],
        };
        if (!allowed[String(order.status)]?.includes(input.status))
          throw new ApiError(409, "Invalid order transition");
        if (input.status === "cancelled") {
          if (order.deliveryRequest)
            throw new ApiError(
              409,
              "Linked delivery must be resolved before cancellation",
            );
          for (const item of order.items as {
            listing: unknown;
            kind: string;
            quantity: number;
          }[]) {
            await (
              item.kind === "product" ? db.Product : db.Livestock
            ).updateOne(
              { _id: item.listing },
              { $inc: { quantity: item.quantity } },
              { session },
            );
          }
        }
        order.status = input.status;
        await order.save({ session });
        return order;
      }),
    );
  }
}
