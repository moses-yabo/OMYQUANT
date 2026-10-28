import { rentalUnits } from "../../lib/rental-pricing";
import { approvedBusinessFilter } from "../../lib/business-registry";
import { z } from "zod";
import * as db from "../database/models";
import { changeReservation } from "../modules/inventory";
import { manage } from "../shared/access";
import { ApiError, id, money, text } from "../shared/http";
import type { ApiContext } from "./context";
import { json, body } from "./http";


export async function rentalRoutes({ request, path, method, actor }: ApiContext): Promise<Response | undefined> {
  if (path === "rentals/reservations" && method === "POST") {
    const input = z
      .object({
        trailer: id,
        rateUnit: z.enum(["hour", "day", "month"]).default("day"),
        start: z.coerce.date().min(new Date()),
        end: z.coerce.date(),
      })
      .strict()
      .refine((x) => x.end > x.start, "End must follow start")
      .parse(await body(request));
    const trailer = await db.Trailer.findOne({
      _id: input.trailer,
      active: true,
    });
    if (!trailer) throw new ApiError(404, "Trailer unavailable");
    if (
      !(await db.Business.exists({
        _id: trailer.business,
        ...approvedBusinessFilter(),
        types: "trailer_rental",
      }))
    )
      throw new ApiError(
        409,
        "Trailer provider is not verified or available",
      );
    const unitPrice =
      input.rateUnit === "hour"
        ? trailer.hourlyPrice
        : input.rateUnit === "month"
          ? trailer.monthlyPrice
          : trailer.dailyPrice;
    if (unitPrice === undefined)
      throw new ApiError(
        400,
        "This rental rate is not offered by the provider",
      );
    const total =
      rentalUnits(
        input.start.getTime(),
        input.end.getTime(),
        input.rateUnit,
      ) * Number(unitPrice);
    if (!Number.isSafeInteger(total))
      throw new ApiError(400, "Rental total exceeds supported range");
    return json(
      await db.Reservation.create({
        ...input,
        customer: actor.id,
        business: String(trailer.business),
        unitPrice,
        total,
      }),
      201,
    );
  }
  const reservationMatch = path.match(
    /^rentals\/reservations\/([a-f0-9]{24})$/i,
  );
  if (reservationMatch && method === "PATCH")
    return json(
      await changeReservation(
        actor,
        reservationMatch[1],
        await body(request),
      ),
    );
  const paymentMatch = path.match(
    /^rentals\/reservations\/([a-f0-9]{24})\/external-payment$/i,
  );
  if (paymentMatch && method === "POST") {
    const input = z
      .object({ amount: money, reference: text })
      .strict()
      .parse(await body(request));
    const reservation = await db.Reservation.findById(paymentMatch[1]);
    if (!reservation) throw new ApiError(404, "Reservation not found");
    await manage(actor, reservation.business, "trailer_rental");
    reservation.set("externalPayment", {
      ...input,
      recordedBy: actor.id,
      recordedAt: new Date(),
      verification: "business_reported",
    });
    await reservation.save();
    return json(reservation);
  }
}
