import * as db from "../database/models";
import { manage } from "../shared/access";
import { id } from "../shared/http";
import type { ApiContext } from "./context";
import { list } from "./http";


export async function historyRoutes({ path, method, url, actor }: ApiContext): Promise<Response | undefined> {
  const histories = {
    "farming/orders": db.Order,
    "transport/bookings": db.Booking,
    "rentals/reservations": db.Reservation,
    "logistics/requests": db.Delivery,
    "business-transport/requests": db.TransportRequest,
  };
  if (method === "GET" && path in histories) {
    const filter = url.searchParams.get("business");
    if (filter)
      await manage(
        actor,
        id.parse(filter),
        path === "farming/orders"
          ? "farm"
          : path === "transport/bookings"
            ? "taxi_operator"
            : path === "rentals/reservations"
              ? "trailer_rental"
              : path === "logistics/requests"
                ? "logistics"
                : "commercial_transport",
        false,
        "read",
      );
    return list(
      histories[path as keyof typeof histories],
      filter ? { business: filter } : { customer: actor.id },
      url,
    );
  }
}
