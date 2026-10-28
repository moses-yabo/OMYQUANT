import { placeOrder, bookSeats, cancelBooking } from "../modules/inventory";
import type { ApiContext } from "./context";
import { json, body } from "./http";


export async function bookingRoutes({ request, path, method, actor }: ApiContext): Promise<Response | undefined> {
  if (path === "farming/orders" && method === "POST")
    return json(await placeOrder(actor, await body(request)), 201);
  if (path === "transport/bookings" && method === "POST")
    return json(await bookSeats(actor, await body(request)), 201);
  const bookingMatch = path.match(
    /^transport\/bookings\/([a-f0-9]{24})\/cancel$/i,
  );
  if (bookingMatch && method === "POST")
    return json(await cancelBooking(actor, bookingMatch[1]));
}
