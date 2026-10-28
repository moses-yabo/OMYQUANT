import {
  SubmissionForm as Form,
  SubmissionButton,
} from "../components/submission-feedback";
import { data, Link, useNavigation } from "react-router";
import type { Route } from "./+types/delivery";
import { Shell } from "../components/shell";
import { requireCustomerPage } from "../.server/customer-access";
import { Delivery, Quote } from "../.server/database/models";
import { api, mutationOrigin, result } from "../.server/frontend";
import { zar } from "../lib/marketplace";
type Details = {
  delivery: { description: string; status: string };
  quotes: {
    _id: string;
    price: number;
    status: string;
    business?: { name: string };
  }[];
};
export async function loader({ request, params }: Route.LoaderArgs) {
  if (!/^[a-f0-9]{24}$/i.test(params.id!))
    throw new Response("Not found", { status: 404 });
  const actor = await requireCustomerPage(request);
  const delivery = await Delivery.findOne({
    _id: params.id,
    customer: actor.id,
  })
    .select("description status")
    .lean();
  if (!delivery) throw new Response("Not found", { status: 404 });
  const quotes = await Quote.find({ request: params.id })
    .select("_id price status business")
    .populate("business", "name")
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  return data(JSON.parse(JSON.stringify({ delivery, quotes })) as Details, {
    headers: { "Cache-Control": "no-store" },
  });
}
export async function action({ request, params }: Route.ActionArgs) {
  mutationOrigin(request);
  const form = await request.formData();
  const quote = String(form.get("quote"));
  if (!/^[a-f0-9]{24}$/i.test(quote) || !/^[a-f0-9]{24}$/i.test(params.id!))
    return data({ error: "Invalid quote", success: "" }, { status: 400 });
  const actor = await requireCustomerPage(request);
  if (
    !(await Delivery.exists({ _id: params.id, customer: actor.id })) ||
    !(await Quote.exists({ _id: quote, request: params.id }))
  )
    return data({ error: "Quote not found", success: "" }, { status: 404 });
  const response = await api(
    request,
    `logistics/quotes/${quote}/accept`,
    "POST",
    {},
  );
  const payload = await result(response);
  return data(
    {
      error: response.ok
        ? ""
        : (payload.error?.message ?? "Unable to accept quote"),
      success: response.ok
        ? "Quote accepted. The business can now assign your delivery."
        : "",
    },
    { status: response.status },
  );
}
export default function DeliveryPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const pending = useNavigation().state !== "idle";
  return (
    <Shell>
      <div className="form-page">
        <Link to="/account#deliveries">My deliveries</Link>
        <h1>Delivery quotes</h1>
        <p>{loaderData.delivery.description}</p>
        <p className="notice">{loaderData.delivery.status}</p>
        {actionData?.error && (
          <p className="notice error" role="alert">
            {actionData.error}
          </p>
        )}
        {actionData?.success && (
          <p className="notice" role="status">
            {actionData.success}
          </p>
        )}
        <section className="form-panel">
          {!loaderData.quotes.length && (
            <p>No quotes yet. Check back for provider offers.</p>
          )}
          {loaderData.quotes.map((quote) => (
            <article className="activity-card" key={quote._id}>
              <h2>{quote.business?.name ?? "Independent provider"}</h2>
              <p>
                {zar(quote.price)} · {quote.status}
              </p>
              {loaderData.delivery.status === "requested" &&
                quote.status === "offered" && (
                  <Form method="post">
                    <input type="hidden" name="quote" value={quote._id} />
                    <SubmissionButton className="button" disabled={pending}>
                      Accept quote
                    </SubmissionButton>
                  </Form>
                )}
            </article>
          ))}
        </section>
      </div>
    </Shell>
  );
}
