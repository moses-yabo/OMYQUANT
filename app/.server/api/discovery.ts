import { approvedBusinessFilter } from "../../lib/business-registry";
import * as db from "../database/models";
import { resources } from "../modules/resources";
import { TAXI_PASSENGER_CAPACITY } from "../../lib/taxi-capacity";
import { page } from "../shared/http";
import type { PublicApiContext } from "./context";
import { headers } from "./http";
import { publicCatalogList } from "../cache/public-catalog";


export async function publicDiscovery({ path, method, url }: PublicApiContext): Promise<Response | undefined> {
  if (method === "GET") {
    if (
      path === "transport/departures" &&
      !url.searchParams.has("business")
    ) {
      const { page: current, limit } = page.parse(
        Object.fromEntries(url.searchParams),
      );
      const data = await db.Departure.find({
        status: "scheduled",
        startsAt: { $gt: new Date() },
        remaining: { $gt: 0 },
        $expr: {
          $lt: [
            { $subtract: ["$capacity", "$remaining"] },
            { $min: ["$capacity", TAXI_PASSENGER_CAPACITY] },
          ],
        },
        business: {
          $in: await db.Business.distinct("_id", {
            ...approvedBusinessFilter(),
            types: "taxi_operator",
          }),
        },
      })
        .populate({ path: "route", select: "name stops" })
        .sort({ startsAt: 1 })
        .skip((current - 1) * limit)
        .limit(limit)
        .lean();
      return Response.json(
        { data, pagination: { page: current, limit } },
        { headers },
      );
    }
    for (const [key, resource] of Object.entries(resources)) {
      if (
        !resource.public ||
        path !== key ||
        url.searchParams.has("business")
      )
        continue;
      const filter: Record<string, unknown> = {
        business: {
          $in: await db.Business.distinct("_id", {
            ...approvedBusinessFilter(),
            types: resource.type,
          }),
        },
      };
      if (key === "farming/products" || key === "farming/livestock")
        filter.status = "published";
      if (key === "rentals/trailers") filter.active = true;
      return publicCatalogList(key, resource.model, filter, url);
    }
  }
}
