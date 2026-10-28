import { data } from "react-router";
import type { Route } from "./+types/reserve";
import { api, configured, mutationOrigin, result } from "../.server/frontend";
import { notifyBookingCreated } from "../lib/web-notifications";
export async function action({ request }: Route.ActionArgs) {
  mutationOrigin(request);
  const form = await request.formData();
  const kind = String(form.get("kind"));
  const id = String(form.get("id"));
  const quantity = Number(form.get("quantity"));
  if (!configured())
    return data(
      { error: "Reservations require a configured marketplace connection." },
      { status: 503 },
    );
  let path: string;
  let payload: unknown;
  if (kind === "taxis") {
    path = "transport/bookings";
    payload = { departure: id, seats: quantity };
  } else if (kind === "trailers") {
    path = "rentals/reservations";
    payload = {
      trailer: id,
      rateUnit: String(form.get("rateUnit") ?? "day"),
      start:
        form.get("rateUnit") === "hour"
          ? `${form.get("start")}:00+02:00`
          : `${form.get("start")}T08:00:00+02:00`,
      end:
        form.get("rateUnit") === "hour"
          ? `${form.get("end")}:00+02:00`
          : `${form.get("end")}T08:00:00+02:00`,
    };
  } else if (kind === "products" || kind === "livestock") {
    path = "farming/orders";
    payload = {
      items: [
        {
          listing: id,
          kind: kind === "products" ? "product" : "livestock",
          quantity,
        },
      ],
      fulfilment: String(form.get("fulfilment")),
    };
  } else return data({ error: "Unknown listing type." }, { status: 400 });
  const response = await api(request, path, "POST", payload);
  const parsed = await result<{
    _id: string;
    departure?: string;
    startsAt?: string;
    vehicle?: string;
  }>(response);
  if (!response.ok)
    return data(
      {
        error:
          parsed.error?.issues?.map((i) => i.message).join(" · ") ??
          parsed.error?.message ??
          "Unable to complete this request.",
      },
      { status: response.status },
    );
  return {
    success:
      kind === "trailers"
        ? "Reservation requested. The rental business will review it."
        : kind === "taxis"
          ? `${parsed.data?.departure && parsed.data.departure !== id ? "Your group is reserved on the next scheduled taxi for the same operator, route and fare." : "Your seats are reserved."}${parsed.data?.startsAt ? ` Departure: ${new Date(parsed.data.startsAt).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" })} (South African time).` : ""}`
          : "Your order has been placed.",
    reference: parsed.data?._id,
  };
}
export async function clientAction({
  request,
  serverAction,
}: Route.ClientActionArgs) {
  const form = await request.clone().formData();
  if (form.get("demo") !== "true") {
    const response = await serverAction();
    if ("reference" in response && response.reference) {
      const reference = response.reference;
      void notifyBookingCreated(String(form.get("kind")), reference);
    }
    return response;
  }
  try {
    const { bookLocal } = await import("../lib/local-bookings");
    const kind = String(form.get("kind"));
    const booking = await bookLocal({
      id: String(form.get("id")),
      kind,
      quantity: Number(form.get("quantity")),
      ...(kind === "trailers"
        ? {
            start: `${form.get("start")}T08:00:00+02:00`,
            end: `${form.get("end")}T08:00:00+02:00`,
          }
        : {}),
    });
    void notifyBookingCreated(kind, booking._id, true);
    return {
      success:
        kind === "trailers"
          ? "Your trailer rental request is saved in this browser. You can simulate business approval in My rentals."
          : kind === "products" || kind === "livestock"
            ? "Your farmers’ market order has been placed and saved in this browser."
            : "Your seats have been reserved and saved in this browser.",
      reference: booking._id,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to save to browser storage.",
    };
  }
}
export function loader() {
  return new Response("Method not allowed", {
    status: 405,
    headers: { Allow: "POST" },
  });
}
