import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/business";
import { Shell } from "../components/shell";
import { Icon } from "../components/icon";
import { api, configured, mutationOrigin, result } from "../.server/frontend";
type Business = {
  _id: string;
  name: string;
  types: string[];
  verified: boolean;
};
export async function loader({ request }: Route.LoaderArgs) {
  if (!configured())
    return {
      businesses: [] as Business[],
      preview: true,
      signedIn: false,
      error: "",
    };
  const response = await api(request, "businesses");
  const parsed = await result<Business[]>(response);
  return data(
    {
      businesses: parsed.data ?? [],
      preview: false,
      signedIn: response.status !== 401,
      error: response.status === 401 ? "" : (parsed.error?.message ?? ""),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function action({ request }: Route.ActionArgs) {
  mutationOrigin(request);
  if (!configured())
    return data(
      { error: "Business tools are unavailable in preview mode.", success: "" },
      { status: 503 },
    );
  const form = await request.formData();
  const get = (key: string) => String(form.get(key) ?? "");
  let path: string;
  let payload: unknown;
  if (get("intent") === "product") {
    path = "farming/products";
    payload = {
      business: get("business"),
      name: get("name"),
      description: get("description"),
      price: Math.round(Number(form.get("price")) * 100),
      quantity: Number(form.get("quantity")),
      unit: get("unit"),
      category: get("category"),
      images: get("image") ? [get("image")] : [],
      location: { address: get("address"), province: get("province") },
      status: get("status"),
    };
  } else if (get("intent") === "business") {
    path = "businesses";
    payload = {
      name: get("name"),
      description: get("description"),
      types: form.getAll("types").map(String),
      contact: { email: get("email"), phone: get("phone") },
      locations: [{ address: get("address"), province: get("province") }],
    };
  } else
    return data(
      { error: "Unknown business action.", success: "" },
      { status: 400 },
    );
  const response = await api(request, path, "POST", payload);
  const parsed = await result(response);
  return data(
    {
      error: response.ok
        ? ""
        : (parsed.error?.issues
            ?.map((i) => `${i.path.join(".")}: ${i.message}`)
            .join(" · ") ??
          parsed.error?.message ??
          "Unable to save."),
      success: response.ok
        ? get("intent") === "product"
          ? "Your product listing has been saved."
          : "Your business has been created. Welcome to the community."
        : "",
    },
    { status: response.status },
  );
}
export function meta() {
  return [{ title: "Grow your business | OMYQUANT" }];
}
export default function BusinessPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const disabled =
    loaderData.preview || !loaderData.signedIn || navigation.state !== "idle";
  return (
    <Shell>
      <div className="form-page">
        <span className="eyebrow">
          INDEPENDENT BUSINESS. SHARED POSSIBILITIES.
        </span>
        <h1>Make your next connection.</h1>
        <p className="muted">
          Bring your farm, transport, rental, or delivery business to OMYQUANT.
        </p>
        {loaderData.preview && (
          <p className="notice">
            Business tools are in preview. You can explore the forms; saving
            becomes available when the marketplace is connected.
          </p>
        )}
        {!loaderData.preview && !loaderData.signedIn && (
          <p className="notice">
            <Link to="/login">Sign in</Link> or{" "}
            <Link to="/register">create an account</Link> to register your
            business.
          </p>
        )}
        {(loaderData.error || actionData?.error) && (
          <p role="alert" className="notice error">
            {loaderData.error || actionData?.error}
          </p>
        )}
        {actionData?.success && (
          <p role="status" className="notice">
            {actionData.success}
          </p>
        )}
        {loaderData.businesses.length > 0 && (
          <section className="form-panel">
            <h2>Your businesses</h2>
            {loaderData.businesses.map((b) => (
              <div className="activity-card activity-row" key={b._id}>
                <div>
                  <h3>{b.name}</h3>
                  <p className="muted">
                    {b.types.map((t) => t.replaceAll("_", " ")).join(" · ")}
                  </p>
                </div>
                <span className="status-pill">
                  {b.verified ? "Verified" : "Verification pending"}
                </span>
              </div>
            ))}
          </section>
        )}
        <Form method="post" className="form-panel">
          <input type="hidden" name="intent" value="business" />
          <h2>
            <Icon name="store" /> Register your business
          </h2>
          <label>
            Business name
            <input
              name="name"
              required
              placeholder="The name your community knows"
            />
          </label>
          <label>
            Tell us about your business
            <textarea name="description" required />
          </label>
          <fieldset className="business-types">
            <legend>What services do you offer?</legend>
            {[
              ["farm", "Farm / agricultural seller"],
              ["taxi_operator", "Taxi operator"],
              ["trailer_rental", "Trailer rentals"],
              ["logistics", "Logistics / deliveries"],
              ["commercial_transport", "Commercial transport"],
            ].map(([value, label]) => (
              <label key={value}>
                <input type="checkbox" name="types" value={value} />
                {label}
              </label>
            ))}
          </fieldset>
          <div className="form-grid">
            <label>
              Contact email
              <input type="email" name="email" required autoComplete="email" />
            </label>
            <label>
              Contact phone
              <input type="tel" name="phone" required autoComplete="tel" />
            </label>
            <label>
              Operating address
              <input name="address" required />
            </label>
            <label>
              Province
              <Province />
            </label>
          </div>
          <button className="button full" disabled={disabled}>
            {navigation.state !== "idle" ? "Saving…" : "Create business"}
            <Icon name="arrow" size={16} />
          </button>
        </Form>
        {(loaderData.preview ||
          loaderData.businesses.some((b) => b.types.includes("farm"))) && (
          <Form method="post" className="form-panel">
            <input type="hidden" name="intent" value="product" />
            <h2>Share your next harvest</h2>
            <p className="muted">
              Create an agricultural product listing. Set a price in rand;
              customers pay through your agreed arrangements.
            </p>
            <label>
              Seller business
              <select name="business" required>
                {loaderData.preview ? (
                  <option value="">Select your farm business</option>
                ) : (
                  loaderData.businesses
                    .filter((b) => b.types.includes("farm"))
                    .map((b) => (
                      <option value={b._id} key={b._id}>
                        {b.name}
                      </option>
                    ))
                )}
              </select>
            </label>
            <label>
              Product name
              <input
                name="name"
                required
                placeholder="e.g. Fresh seasonal vegetable box"
              />
            </label>
            <label>
              Description
              <textarea name="description" required />
            </label>
            <div className="form-grid">
              <label>
                Category
                <select name="category">
                  {[
                    ["produce", "Crops & produce"],
                    ["feed", "Animal feed"],
                    ["hay_straw", "Hay & straw"],
                    ["equipment", "Equipment"],
                    ["supplies", "Agricultural supplies"],
                    ["other", "Other"],
                  ].map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Price (R)
                <input
                  type="number"
                  name="price"
                  min="0"
                  step="0.01"
                  required
                />
              </label>
              <label>
                Quantity available
                <input
                  type="number"
                  name="quantity"
                  min="0"
                  step="1"
                  required
                />
              </label>
              <label>
                Unit of measurement
                <input name="unit" placeholder="box, kg, bag, tray" required />
              </label>
              <label>
                Collection address
                <input name="address" required />
              </label>
              <label>
                Province
                <Province />
              </label>
            </div>
            <label>
              Product image URL (optional)
              <input type="url" name="image" placeholder="https://…" />
            </label>
            <label>
              Listing status
              <select name="status">
                <option value="draft">Save as draft</option>
                <option value="published">Publish to marketplace</option>
              </select>
            </label>
            <button className="button full" disabled={disabled}>
              Save listing <Icon name="arrow" size={16} />
            </button>
          </Form>
        )}
      </div>
    </Shell>
  );
}
function Province() {
  return (
    <select name="province" required defaultValue="">
      <option value="" disabled>
        Select province
      </option>
      {[
        "Gauteng",
        "Limpopo",
        "Free State",
        "Western Cape",
        "Eastern Cape",
        "KwaZulu-Natal",
        "Mpumalanga",
        "North West",
        "Northern Cape",
      ].map((p) => (
        <option key={p}>{p}</option>
      ))}
    </select>
  );
}
