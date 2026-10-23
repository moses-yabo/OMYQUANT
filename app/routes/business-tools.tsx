import { SubmissionForm as Form, SubmissionButton } from "../components/submission-feedback";
import { data, Link, redirect, useNavigation, useNavigate } from "react-router";
import type { Route } from "./+types/business-tools";
import { Shell } from "../components/shell";
import { api, result, mutationOrigin } from "../.server/frontend";
import { authenticate, sessionToken } from "../.server/modules/auth/auth";
import { connectToDatabase } from "../.server/database/connect";
import {
  businessTool,
  toolsPage,
  toolKey,
  toolMutation,
  toolDefinitions,
  businessStatistics,
  type BusinessStatistic,
} from "../.server/modules/business-tools";
import { ApiError } from "../.server/shared/http";
import {
  boundedBody,
  imageBucket,
  imageLimit,
  ImageError,
  storeImage,
} from "../.server/database/images";
import { businessToolLabels } from "../lib/business-tools";
import { zar } from "../lib/marketplace";
import { z } from "zod";
import {
  TAXI_PASSENGER_CAPACITY,
  taxiSeatsAvailable,
} from "../lib/taxi-capacity";

async function actorFor(request: Request) {
  if (!(await sessionToken(request))) throw redirect("/login");
  await connectToDatabase();
  try {
    return await authenticate(request);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401)
      throw redirect("/login");
    throw error;
  }
}
export async function loader({ request, params }: Route.LoaderArgs) {
  const actor = await actorFor(request);
  try {
    const loaded = await toolsPage(actor, params.id!, new URL(request.url));
    const overview = !new URL(request.url).searchParams.has('tool');
    const statistics = overview ? await businessStatistics(params.id!, loaded.available) : [];
    // Serialize database values explicitly for the route boundary.
    return data(JSON.parse(JSON.stringify({ ...loaded, overview, statistics })) as ToolsData, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ApiError)
      throw new Response(error.message, { status: error.status });
    if (error instanceof z.ZodError)
      throw new Response("Invalid business tool filters.", { status: 400 });
    throw error;
  }
}
type RecordItem = {
  _id: string;
  name?: string;
  registration?: string;
  status?: string;
  active?: boolean;
  quantity?: number;
  price?: number;
  dailyPrice?: number;
  total?: number;
  seats?: number;
  remaining?: number;
  capacity?: number;
  start?: string;
  end?: string;
  startsAt?: string;
  items?: { name: string; quantity: number }[];
  customer?: string;
  trailer?: string;
  departure?: string;
  user?: string;
  driver?: string;
  hourlyPrice?: number;
  monthlyPrice?: number;
  question?: string;
  answer?: string;
  goodsType?: string;
  weightKg?: number;
  pickup?: { province?: string };
  dropoff?: { province?: string };
};
type ToolsData = {
  overview: boolean;
  statistics: BusinessStatistic[];
  businesses: { _id: string; name: string }[];
  writable: boolean;
  business: { _id: string; name: string };
  available: (keyof typeof businessToolLabels)[];
  tool: keyof typeof businessToolLabels;
  records: RecordItem[];
  total: number;
  page: number;
  limit: number;
  vehicles: { _id: string; registration: string }[];
  routes: { _id: string; name: string }[];
  drivers: { _id: string; user: string }[];
};
export async function action({ request, params }: Route.ActionArgs) {
  mutationOrigin(request);
  const actor = await actorFor(request);
  let uploaded: { id: string; url: string } | undefined;
  try {
    if (request.method !== "POST")
      throw new ApiError(405, "Method not allowed");
    const bytes = await boundedBody(request, imageLimit + 65536);
    const form = await new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": request.headers.get("Content-Type") ?? "" },
    }).formData();
    const get = (key: string) => String(form.get(key) ?? "");
    const num = (key: string) => Number(get(key));
    const tool = toolKey(get("tool"));
    await businessTool(actor, params.id!, tool);
    let path: string = toolDefinitions[tool].path;
    let method = "POST";
    let payload: Record<string, unknown> = { business: params.id };
    const location = { address: get("address"), province: get("province") };
    if (get('intent') === 'quote') {
      if (tool !== 'deliveryRequests') throw new ApiError(400, 'Invalid quote request');
      path = await toolMutation(actor, params.id!, tool, get('record')); payload = { business: params.id, price: Math.round(num('price') * 100), capabilities: [get('goodsType')] };
    } else if (get('intent') === 'reply') {
      path = await toolMutation(actor, params.id!, tool, get('record')); method = 'PATCH'; payload = { answer: get('answer') };
    } else if (get('intent') === 'edit') {
      path = await toolMutation(actor, params.id!, tool, get('record')); method = 'PATCH'; payload = {};
      if (['products', 'livestock'].includes(tool)) payload = { name: get('name'), price: Math.round(num('price') * 100), quantity: num('quantity') };
      else if (tool === 'trailers') payload = { name: get('name'), dailyPrice: Math.round(num('price') * 100), ...(get('hourlyPrice') ? { hourlyPrice: Math.round(num('hourlyPrice') * 100) } : {}), ...(get('monthlyPrice') ? { monthlyPrice: Math.round(num('monthlyPrice') * 100) } : {}) };
      else if (['vehicles', 'deliveryVehicles'].includes(tool)) payload = { active: get('active') === 'true', ...(get('driver') ? { driver: get('driver') } : {}) };
      else if (['drivers', 'deliveryPersonnel'].includes(tool)) payload = { active: get('active') === 'true' };
      else throw new ApiError(400, 'This record cannot be edited here');
    } else if (get('intent') === 'assign') {
      path = `${await toolMutation(actor, params.id!, tool, get('record'))}/assignment`; method = 'PATCH'; payload = { vehicle: get('vehicle'), driver: get('driver') };
    } else if (get("intent") === "status") {
      path = await toolMutation(actor, params.id!, tool, get("record"));
      method = "PATCH";
      if (["orders", "departures", 'deliveries'].includes(tool)) path += "/status";
      if (
        [
          "orders",
          "departures",
          "reservations",
          "products",
          "livestock",
          'deliveries',
        ].includes(tool)
      )
        payload = { status: get("status") };
      else if (tool === "trailers")
        payload = { active: get("status") === "active" };
      else throw new ApiError(400, "Unsupported status action");
      if (tool === 'deliveries' && get('proof')) payload.proof = get('proof');
    } else if (get("intent") === "create") {
      if (["products", "livestock", "trailers"].includes(tool)) {
        const file = form.get("imageFile");
        if (file instanceof File && file.size)
          uploaded = await storeImage(
            new Uint8Array(await file.arrayBuffer()),
            params.id!,
            file.type,
          );
        payload = {
          ...payload,
          name: get("name"),
          location,
          images: uploaded ? [uploaded.url] : [],
        };
      }
      if (tool === "products" || tool === "livestock")
        payload = {
          ...payload,
          description: get("description"),
          price: Math.round(num("price") * 100),
          quantity: num("quantity"),
          status: get("status"),
          ...(tool === "products"
            ? { category: get("category"), unit: get("unit") }
            : {
                animalCategory: get("animalCategory"),
                breed: get("breed"),
                ageMonths: num("ageMonths"),
                sex: get("sex"),
                healthDocuments: [],
              }),
        };
      else if (tool === "trailers")
        payload = {
          ...payload,
          trailerType: get("trailerType"),
          dimensions: {
            length: num("length"),
            width: num("width"),
            height: num("height"),
          },
          payloadKg: num("payloadKg"),
          dailyPrice: Math.round(num("price") * 100),
          ...(get('hourlyPrice') ? { hourlyPrice: Math.round(num('hourlyPrice') * 100) } : {}),
          ...(get('monthlyPrice') ? { monthlyPrice: Math.round(num('monthlyPrice') * 100) } : {}),
          documents: [],
          active: true,
        };
      else if (tool === "vehicles" || tool === 'deliveryVehicles')
        payload = {
          ...payload,
          registration: get("registration"),
          ...(tool === 'vehicles' ? { capacity: num('capacity') } : { payloadKg: num('payloadKg') }),
          ...(get('driver') ? { driver: get('driver') } : {}),
          documents: [],
        };
      else if (tool === 'drivers' || tool === 'deliveryPersonnel') payload = { ...payload, user: get('user'), licenceDocuments: [] };
      else if (tool === "routes")
        payload = {
          ...payload,
          name: get("name"),
          mode: get("mode"),
          scheduled: true,
          stops: [
            location,
            {
              address: get("dropoffAddress"),
              province: get("dropoffProvince"),
            },
          ],
        };
      else if (tool === "departures")
        payload = {
          ...payload,
          vehicle: get("vehicle"),
          route: get("route"),
          startsAt: `${get("startsAt")}:00+02:00`,
          price: Math.round(num("price") * 100),
        };
      else throw new ApiError(400, "This tool does not create listings");
    } else throw new ApiError(400, "Unknown action");
    const response = await api(request, path, method, payload);
    const parsed = await result(response);
    if (!response.ok) {
      if (uploaded && response.status < 500)
        await imageBucket()
          .then(async (bucket) => {
            const { default: mongoose } = await import("mongoose");
            await bucket.delete(new mongoose.Types.ObjectId(uploaded!.id));
          })
          .catch(() => {});
      return data(
        {
          error:
            parsed.error?.issues
              ?.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
              .join("; ") ||
            parsed.error?.message ||
            "Unable to save.",
          success: "",
        },
        { status: response.status },
      );
    }
    return data({ error: "", success: "Saved successfully." });
  } catch (error) {
    if (error instanceof ApiError || error instanceof ImageError)
      return data(
        { error: error.message, success: "" },
        { status: error.status },
      );
    if (error instanceof z.ZodError)
      return data(
        { error: "Invalid business tool input.", success: "" },
        { status: 400 },
      );
    throw error;
  }
}
export function headers() {
  return { "Cache-Control": "no-store" };
}
export function meta() {
  return [
    { title: "Business tools | OMYQUANT" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

const orderTransitions: Record<string, string[]> = {
  placed: ["accepted", "cancelled"],
  accepted: ["fulfilled", "cancelled"],
};
const reservationTransitions: Record<string, string[]> = {
  requested: ["confirmed", "rejected"],
  confirmed: ["picked_up"],
  picked_up: ["returned"],
};
const departureTransitions: Record<string, string[]> = {
  scheduled: ["departed", "cancelled"],
  departed: ["completed"],
};
function Field({
  name,
  label,
  type = "text",
  min,
  step,
}: {
  name: string;
  label: string;
  type?: string;
  min?: number;
  step?: string;
}) {
  return (
    <label>
      {label}
      <input name={name} type={type} min={min} step={step} required />
    </label>
  );
}
function Place({ dropoff = false }: { dropoff?: boolean }) {
  return (
    <>
      <Field
        name={dropoff ? "dropoffAddress" : "address"}
        label={dropoff ? "Destination address" : "Address"}
      />
      <Field
        name={dropoff ? "dropoffProvince" : "province"}
        label={dropoff ? "Destination province" : "Province"}
      />
    </>
  );
}
export default function BusinessTools({
  loaderData: loaded,
  actionData,
}: Route.ComponentProps) {
  const pending = useNavigation().state !== "idle";
  const navigate = useNavigate();
  const tool = loaded.tool;
  const listing = ["products", "livestock", "trailers"].includes(tool);
  const create = loaded.writable && (listing || ['vehicles', 'routes', 'departures', 'drivers', 'deliveryVehicles', 'deliveryPersonnel'].includes(tool));
  const pageLink = (page: number) =>
    `?${new URLSearchParams({ tool, page: String(page) })}`;
  return (
    <Shell workspace={{ business: loaded.business, available: loaded.available }}>
      <div className="form-page">
        <Link className="text-button" to="/business?view=all">
          Back to My business
        </Link>
        <h1>{loaded.business.name}</h1>
        <label>Switch business<select value={loaded.business._id} onChange={event => navigate(`/business/${event.target.value}/tools`)}>{loaded.businesses.map(business => <option key={business._id} value={business._id}>{business.name}</option>)}</select></label>
        <Link className="button outline small" to={`/business/${loaded.business._id}/profile`}>Business profile and team</Link>
        <p className="muted">
          Verified business tools. Access follows your membership and the
          services this business offers.
        </p>
        <Link className="button outline small" to="/support">
          Help and complaints
        </Link>
        <nav className="category-tabs" aria-label="Business services">
          <Link className={`tab ${loaded.overview ? 'active' : ''}`} to="?">Overview</Link>
          {loaded.available.map((key) => (
            <Link
              key={key}
              className={`tab ${!loaded.overview && key === tool ? "active" : ""}`}
              aria-current={key === tool ? "page" : undefined}
              to={`?tool=${key}`}
            >
              {businessToolLabels[key]}
            </Link>
          ))}
        </nav>
        {actionData?.error && (
          <p role="alert" className="notice error">
            {actionData.error}
          </p>
        )}
        {actionData?.success && (
          <p role="status" className="notice">
            {actionData.success}
          </p>
        )}
        {loaded.overview ? <section className="form-panel"><h2>Business statistics</h2><p className="muted">All-time records for {loaded.business.name}, with current upcoming and active work shown separately.</p><div className="form-grid">{loaded.statistics.map(statistic => <Link className="activity-card" key={`${statistic.tool}-${statistic.label ?? statistic.detail}`} to={`?tool=${statistic.tool}`}><h3>{statistic.label ?? businessToolLabels[statistic.tool]}</h3><strong>{statistic.format === 'money' ? zar(statistic.count) : statistic.count}</strong><p className="muted">{statistic.detail}</p></Link>)}</div><p className="notice">Profit / loss: unavailable. Transaction values are not profit. Operating costs, refunds and complete payment receipts are not recorded, so gains and losses cannot yet be calculated reliably. Cancelled values are shown separately and are not treated as losses.</p></section> : <>
        <section className="form-panel">
          <h2>
            {businessToolLabels[tool]} ({loaded.total})
          </h2>
          {tool === "reservations" && (
            <p className="muted">
              Requested: awaiting approval. Confirmed: reserved. Picked up:
              currently rented. Confirming checks for overlapping reservations.
            </p>
          )}
          {!loaded.records.length && <p className="muted">No records yet.</p>}
          {loaded.records.map((record) => {
            const transitions = tool === 'deliveries' ? ({ assigned: ['collected'], collected: ['delivered'] } as Record<string, string[]>)[record.status ?? ''] ?? [] :
              tool === "orders"
                ? (orderTransitions[record.status ?? ""] ?? [])
                : tool === "reservations"
                  ? (reservationTransitions[record.status ?? ""] ?? [])
                  : tool === "departures"
                    ? (departureTransitions[record.status ?? ""] ?? [])
                    : tool === "products" || tool === "livestock"
                      ? ["draft", "published", "inactive"].filter(
                          (status) => status !== record.status,
                        )
                      : tool === "trailers"
                        ? [record.active ? "inactive" : "active"]
                        : [];
            return (
              <article className="activity-card" key={record._id}>
                <h3>
                  {record.name ??
                    record.registration ??
                    `Reference: ${record._id}`}
                </h3>
                <p className="muted">
                  {record.status ??
                    (record.active === undefined
                      ? ""
                      : record.active
                        ? "Active"
                        : "Inactive")}
                </p>
                {record.user && <p>Assigned user: {record.user}</p>}
                {tool === 'deliveryRequests' && <><p>{record.pickup?.province} → {record.dropoff?.province}</p><p>{record.goodsType} · {record.weightKg} kg</p>{loaded.writable && <Form method="post"><input type="hidden" name="tool" value={tool} /><input type="hidden" name="intent" value="quote" /><input type="hidden" name="record" value={record._id} /><input type="hidden" name="goodsType" value={record.goodsType} /><Field name="price" label="Delivery quote (R)" type="number" min={0} step="0.01" /><SubmissionButton className="button small" disabled={pending}>Offer quote</SubmissionButton></Form>}</>}
                {tool === 'enquiries' && <><p>{record.question}</p><p>{record.answer || 'No reply yet.'}</p>{loaded.writable && <Form method="post"><input type="hidden" name="tool" value={tool} /><input type="hidden" name="intent" value="reply" /><input type="hidden" name="record" value={record._id} /><label>Reply to customer<textarea name="answer" maxLength={4000} required defaultValue={record.answer} /></label><SubmissionButton className="button small" disabled={pending}>Send reply</SubmissionButton></Form>}</>}
                {loaded.writable && (listing || ['vehicles', 'deliveryVehicles', 'drivers', 'deliveryPersonnel'].includes(tool)) && <details><summary>Edit details</summary><Form method="post">
                  <input type="hidden" name="intent" value="edit" /><input type="hidden" name="record" value={record._id} /><input type="hidden" name="tool" value={tool} />
                  {listing ? <><label>Name<input name="name" defaultValue={record.name} required /></label><label>{tool === 'trailers' ? 'Daily price (R)' : 'Price (R)'}<input name="price" type="number" min="0" step="0.01" defaultValue={(record.dailyPrice ?? record.price ?? 0) / 100} required /></label>{tool !== 'trailers' ? <label>Quantity<input name="quantity" type="number" min="0" defaultValue={record.quantity} required /></label> : <><label>Hourly price (R, optional)<input name="hourlyPrice" type="number" min="0" step="0.01" defaultValue={record.hourlyPrice === undefined ? '' : record.hourlyPrice / 100} /></label><label>Monthly price (R, optional)<input name="monthlyPrice" type="number" min="0" step="0.01" defaultValue={record.monthlyPrice === undefined ? '' : record.monthlyPrice / 100} /></label></>}</> : <><label>Availability<select name="active" defaultValue={String(record.active !== false)}><option value="true">Available</option><option value="false">Unavailable</option></select></label>{['vehicles', 'deliveryVehicles'].includes(tool) && <label>Assign driver<select name="driver" defaultValue={record.driver ?? ''}><option value="">Keep current assignment</option>{loaded.drivers.map(driver => <option key={driver._id} value={driver._id}>{driver.user}</option>)}</select></label>}</>}
                  <SubmissionButton className="button small" disabled={pending}>Save details</SubmissionButton>
                </Form></details>}
                {loaded.writable && tool === 'deliveries' && record.status === 'assigned' && <Form method="post"><input type="hidden" name="intent" value="assign" /><input type="hidden" name="tool" value={tool} /><input type="hidden" name="record" value={record._id} /><label>Vehicle<select name="vehicle" required>{loaded.vehicles.map(vehicle => <option key={vehicle._id} value={vehicle._id}>{vehicle.registration}</option>)}</select></label><label>Delivery person<select name="driver" required>{loaded.drivers.map(driver => <option key={driver._id} value={driver._id}>{driver.user}</option>)}</select></label><SubmissionButton className="button small" disabled={pending}>Assign delivery</SubmissionButton></Form>}
                {record.items?.map((item, index) => (
                  <p key={index}>
                    {item.quantity} × {item.name}
                  </p>
                ))}
                {record.quantity !== undefined && (
                  <p>Stock: {record.quantity}</p>
                )}
                {record.seats !== undefined && (
                  <p>Seats booked: {record.seats}</p>
                )}
                {record.remaining !== undefined && (
                  <p>
                    Seats available:{" "}
                    {taxiSeatsAvailable(
                      record.capacity ?? TAXI_PASSENGER_CAPACITY,
                      record.remaining,
                    )}{" "}
                    /{" "}
                    {Math.min(
                      record.capacity ?? TAXI_PASSENGER_CAPACITY,
                      TAXI_PASSENGER_CAPACITY,
                    )}
                  </p>
                )}
                {(record.dailyPrice ?? record.price ?? record.total) !==
                  undefined && (
                  <p>
                    {zar(
                      record.dailyPrice ?? record.price ?? record.total ?? 0,
                    )}
                    {tool === "trailers" ? " / day" : ""}
                  </p>
                )}
                {record.start && (
                  <p>
                    {new Date(record.start).toLocaleString("en-ZA", {
                      timeZone: "Africa/Johannesburg",
                    })}{" "}
                    to{" "}
                    {new Date(record.end!).toLocaleString("en-ZA", {
                      timeZone: "Africa/Johannesburg",
                    })}
                  </p>
                )}
                {record.startsAt && (
                  <p>
                    {new Date(record.startsAt).toLocaleString("en-ZA", {
                      timeZone: "Africa/Johannesburg",
                    })}
                  </p>
                )}
                {record.trailer && (
                  <p className="muted">Trailer: {record.trailer}</p>
                )}
                {record.departure && (
                  <p className="muted">Departure: {record.departure}</p>
                )}
                {[
                  "orders",
                  "reservations",
                  "bookings",
                  "deliveries",
                  "transportRequests",
                ].includes(tool) && (
                  <Link
                    className="text-button"
                    to={`/support?${new URLSearchParams({ kind: tool === "orders" ? "order" : tool === "reservations" ? "reservation" : tool === "bookings" ? "booking" : tool === "deliveries" ? "delivery" : "transport", reference: record._id })}`}
                  >
                    Report a problem
                  </Link>
                )}
                {loaded.writable && transitions.length > 0 && (
                  <Form method="post">
                    <input type="hidden" name="tool" value={tool} />
                    <input type="hidden" name="record" value={record._id} />
                    <input type="hidden" name="intent" value="status" />
                    <label>
                      Next status
                      <select name="status">
                        {transitions.map((status) => (
                          <option key={status} value={status}>
                            {status.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </label>
                    {tool === 'deliveries' && record.status === 'collected' && <Field name="proof" label="Proof of delivery URL" type="url" />}
                    <SubmissionButton className="button small" disabled={pending}>
                      Update status
                    </SubmissionButton>
                  </Form>
                )}
              </article>
            );
          })}
          {loaded.page > 1 && (
            <Link
              className="button outline small"
              to={pageLink(loaded.page - 1)}
            >
              Previous
            </Link>
          )}
          {loaded.page * loaded.limit < loaded.total && (
            <Link
              className="button outline small"
              to={pageLink(loaded.page + 1)}
            >
              Next
            </Link>
          )}
        </section>
        {create && (
          <Form
            key={tool}
            resetOnSuccess
            method="post"
            encType="multipart/form-data"
            className="form-panel"
          >
            <h2>
              Add{" "}
              {tool === "livestock"
                ? "livestock"
                : tool === "products"
                  ? "product"
                  : tool === "trailers"
                    ? "trailer"
                    : tool === 'drivers' || tool === 'deliveryPersonnel'
                      ? 'driver'
                    : tool === "vehicles" || tool === 'deliveryVehicles'
                      ? "vehicle"
                      : tool === "routes"
                        ? "route"
                        : "departure"}
            </h2>
            <input type="hidden" name="tool" value={tool} />
            <input type="hidden" name="intent" value="create" />
            <div className="form-grid">
              {['drivers', 'deliveryPersonnel'].includes(tool) && <Field name="user" label="Existing driver account ID" />}
              {tool === 'deliveryVehicles' && <><Field name="registration" label="Vehicle registration" /><Field name="payloadKg" label="Payload (kg)" type="number" min={1} step="any" /></>}
              {tool === 'trailers' && <><label>Hourly price (R, optional)<input name="hourlyPrice" type="number" min="0" step="0.01" /></label><label>Monthly price (R, optional)<input name="monthlyPrice" type="number" min="0" step="0.01" /></label></>}
              {(listing || tool === "routes") && (
                <Field name="name" label="Name" />
              )}
              {(tool === "products" || tool === "livestock") && (
                <>
                  <Field name="description" label="Description" />
                  <Field
                    name="quantity"
                    label="Quantity available"
                    type="number"
                    min={0}
                    step="1"
                  />
                  <label>
                    Listing status
                    <select name="status">
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                    </select>
                  </label>
                </>
              )}
              {(listing || tool === "departures") && (
                <Field
                  name="price"
                  label={tool === "trailers" ? "Daily price (R)" : "Price (R)"}
                  type="number"
                  min={0}
                  step="0.01"
                />
              )}
              {tool === "products" && (
                <>
                  <Field name="unit" label="Unit (kg, bag, box)" />
                  <label>
                    Category
                    <select name="category">
                      {[
                        "produce",
                        "feed",
                        "hay_straw",
                        "equipment",
                        "supplies",
                        "other",
                      ].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              {tool === "livestock" && (
                <>
                  <Field
                    name="animalCategory"
                    label="Animal (cattle, sheep, chicken, goat)"
                  />
                  <Field name="breed" label="Breed" />
                  <Field
                    name="ageMonths"
                    label="Age in months"
                    type="number"
                    min={0}
                    step="1"
                  />
                  <label>
                    Sex
                    <select name="sex">
                      {["unknown", "male", "female", "mixed"].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              {tool === "trailers" && (
                <>
                  <Field name="trailerType" label="Trailer type" />
                  <Field
                    name="payloadKg"
                    label="Payload (kg)"
                    type="number"
                    min={0.01}
                    step="any"
                  />
                  {["length", "width", "height"].map((name) => (
                    <Field
                      key={name}
                      name={name}
                      label={`${name} (metres)`}
                      type="number"
                      min={0.01}
                      step="any"
                    />
                  ))}
                </>
              )}
              {(listing || tool === "routes") && <Place />}
              {tool === "routes" && (
                <>
                  <Place dropoff />
                  <label>
                    Route type
                    <select name="mode">
                      <option value="long_distance">Long distance</option>
                      <option value="local">Local</option>
                    </select>
                  </label>
                </>
              )}
              {tool === "vehicles" && (
                <>
                  <Field name="registration" label="Vehicle registration" />
                  <label>
                    Passenger seats (excluding driver)
                    <input
                      name="capacity"
                      type="number"
                      min={1}
                      max={TAXI_PASSENGER_CAPACITY}
                      defaultValue={TAXI_PASSENGER_CAPACITY}
                      step="1"
                      required
                    />
                    <span className="muted">
                      Up to 15 passengers per taxi. Use fewer seats if the
                      vehicle has a lower capacity.
                    </span>
                  </label>
                </>
              )}
              {tool === "departures" && (
                <>
                  <label>
                    Vehicle
                    <select name="vehicle" required>
                      <option value="">Select vehicle</option>
                      {loaded.vehicles.map((vehicle) => (
                        <option key={vehicle._id} value={vehicle._id}>
                          {vehicle.registration}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Route
                    <select name="route" required>
                      <option value="">Select route</option>
                      {loaded.routes.map((route) => (
                        <option key={route._id} value={route._id}>
                          {route.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Field
                    name="startsAt"
                    label="Departure time (South African time)"
                    type="datetime-local"
                  />
                </>
              )}
            </div>
            {listing && (
              <label>
                Image (optional, up to 5 MiB)
                <input
                  type="file"
                  name="imageFile"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                />
              </label>
            )}
            {tool === "departures" &&
              (!loaded.vehicles.length || !loaded.routes.length) && (
                <p className="notice">
                  Add a vehicle and route before scheduling a departure.
                </p>
              )}
            <SubmissionButton className="button full" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </SubmissionButton>
          </Form>
        )}
        </>}
      </div>
    </Shell>
  );
}
