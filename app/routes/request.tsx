import {
  SubmissionForm as Form,
  SubmissionButton,
} from "../components/submission-feedback";
import { Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/request";
import { Shell } from "../components/shell";
import { Icon } from "../components/icon";
import { api, configured, mutationOrigin, result } from "../.server/frontend";
export function loader({ params }: Route.LoaderArgs) {
  if (!["delivery", "transport"].includes(params.kind))
    throw new Response("Not found", { status: 404 });
  return { preview: !configured() };
}
export function meta() {
  return [{ title: "Arrange your next move | OMYQUANT" }];
}
export async function action({ request, params }: Route.ActionArgs) {
  mutationOrigin(request);
  if (!["delivery", "transport"].includes(params.kind))
    throw new Response("Not found", { status: 404 });
  if (!configured())
    return data(
      { error: "Requests are unavailable in preview mode.", success: false },
      { status: 503 },
    );
  const form = await request.formData();
  const get = (key: string) => String(form.get(key) ?? "");
  const pickup = { address: get("pickup"), province: get("pickupProvince") };
  const dropoff = { address: get("dropoff"), province: get("dropoffProvince") };
  const payload =
    params.kind === "delivery"
      ? {
          pickup,
          dropoff,
          goodsType: get("goodsType"),
          description: get("description"),
          weightKg: Number(form.get("weight")),
          dimensions: {
            length: Number(form.get("length")),
            width: Number(form.get("width")),
            height: Number(form.get("height")),
          },
          requirements: [],
          ...(get("order") ? { order: get("order") } : {}),
        }
      : {
          pickup,
          dropoff,
          kind: get("type"),
          passengers: Number(form.get("passengers")),
          startsAt: `${get("startsAt")}:00+02:00`,
        };
  const response = await api(
    request,
    params.kind === "delivery"
      ? "logistics/requests"
      : "business-transport/requests",
    "POST",
    payload,
  );
  const parsed = await result(response);
  return data(
    {
      error: response.ok
        ? ""
        : (parsed.error?.issues
            ?.map((i) => `${i.path.join(".")}: ${i.message}`)
            .join(" · ") ??
          parsed.error?.message ??
          "Request failed."),
      success: response.ok,
    },
    { status: response.status },
  );
}
export default function RequestPage({
  params,
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const delivery = params.kind === "delivery";
  const navigation = useNavigation();
  return (
    <Shell>
      <div className="form-page">
        <span className="eyebrow">LET’S GET THINGS MOVING</span>
        <h1>
          {delivery
            ? "From here to there, with care."
            : "Your people. Your next journey."}
        </h1>
        <p className="muted">
          {delivery
            ? "Tell us what needs moving. Independent delivery businesses can send you a quotation."
            : "Request staff transport, a group charter, or a private minibus."}
        </p>
        {loaderData.preview && (
          <p className="notice">
            Explore the form in preview mode. Sending requests becomes available
            when the marketplace is connected.
          </p>
        )}
        {actionData?.error && (
          <p role="alert" className="notice error">
            {actionData.error} <Link to="/login">Sign in</Link>
          </p>
        )}
        {actionData?.success ? (
          <div className="empty-state">
            <Icon name="check" size={40} />
            <h3>Your request is in.</h3>
            <p>View your request and follow its progress in your activity.</p>
            <Link className="button" to="/account">
              View my activity
            </Link>
          </div>
        ) : (
          <Form
            method="post"
            resetOnSuccess
            successMessage="Your request has been submitted. Follow its progress in your activity."
            className="form-panel"
          >
            <h2>The journey details</h2>
            <div className="form-grid">
              <label>
                Pickup address
                <input
                  name="pickup"
                  required
                  placeholder="Street, suburb, town"
                />
              </label>
              <label>
                Pickup province
                <Province name="pickupProvince" />
              </label>
              <label>
                Destination address
                <input
                  name="dropoff"
                  required
                  placeholder="Street, suburb, town"
                />
              </label>
              <label>
                Destination province
                <Province name="dropoffProvince" />
              </label>
            </div>
            {delivery ? (
              <>
                <label>
                  What are you sending?
                  <select name="goodsType">
                    <option value="parcel">Parcel or general goods</option>
                    <option value="agricultural">Agricultural goods</option>
                    <option value="livestock">
                      Livestock — specialist transport
                    </option>
                  </select>
                </label>
                <label>
                  Description
                  <textarea
                    name="description"
                    required
                    placeholder="Describe the goods and any special handling needs"
                  />
                </label>
                <div className="form-grid">
                  <label>
                    Weight (kg)
                    <input
                      type="number"
                      name="weight"
                      min="0.01"
                      step="0.01"
                      required
                    />
                  </label>
                  <label>
                    Length (metres)
                    <input
                      type="number"
                      name="length"
                      min="0.01"
                      step="0.01"
                      required
                    />
                  </label>
                  <label>
                    Width (metres)
                    <input
                      type="number"
                      name="width"
                      min="0.01"
                      step="0.01"
                      required
                    />
                  </label>
                  <label>
                    Height (metres)
                    <input
                      type="number"
                      name="height"
                      min="0.01"
                      step="0.01"
                      required
                    />
                  </label>
                </div>
                <label>
                  Farm order reference (optional)
                  <input
                    name="order"
                    pattern="[a-fA-F0-9]{24}"
                    placeholder="Full order reference from your activity"
                  />
                </label>
                <p className="muted">
                  Livestock requires a suitable specialist provider. An ordinary
                  passenger taxi is not a livestock carrier.
                </p>
              </>
            ) : (
              <>
                <label>
                  Type of journey
                  <select name="type">
                    <option value="staff">Staff transportation</option>
                    <option value="charter">Group charter</option>
                    <option value="private_minibus">Private minibus</option>
                  </select>
                </label>
                <div className="form-grid">
                  <label>
                    Passengers
                    <input
                      type="number"
                      name="passengers"
                      min="1"
                      max="1000000"
                      required
                    />
                  </label>
                  <label>
                    Departure (South African time)
                    <input type="datetime-local" name="startsAt" required />
                  </label>
                </div>
              </>
            )}
            <SubmissionButton
              className="button full"
              disabled={loaderData.preview || navigation.state !== "idle"}
            >
              {navigation.state !== "idle" ? "Sending…" : "Send request"}
              <Icon name="arrow" size={16} />
            </SubmissionButton>
          </Form>
        )}
      </div>
    </Shell>
  );
}
export function Province({ name }: { name: string }) {
  return (
    <select name={name} required defaultValue="">
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
