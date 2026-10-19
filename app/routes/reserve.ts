import { data } from "react-router";
import type { Route } from "./+types/reserve";
import { api, configured, mutationOrigin, result } from "../.server/frontend";
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
      start: `${form.get("start")}T08:00:00+02:00`,
      end: `${form.get("end")}T08:00:00+02:00`,
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
  const parsed = await result<{ _id: string }>(response);
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
          ? "Your seats are reserved."
          : "Your order has been placed.",
    reference: parsed.data?._id,
  };
}
export async function clientAction({
  request,
  serverAction,
}: Route.ClientActionArgs) {
  const form = await request.clone().formData();
  if (form.get("demo") !== "true") return serverAction();
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
    return {
      success:
        kind === "trailers"
          ? "Local trailer request saved. Simulate approval in My activity."
          : "Booking saved in your browser.",
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
