import { SubmissionForm as Form, SubmissionButton } from "../components/submission-feedback";
import { Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/account";
import { Shell } from "../components/shell";
import { Icon } from "../components/icon";
import { zar } from "../lib/marketplace";
import { api, configured, mutationOrigin, result } from "../.server/frontend";
import { demoEnabled } from '../.server/demo-mode';
type Activity = {
  _id: string;
  status: string;
  total?: number;
  seats?: number;
  unitPrice?: number;
  start?: string;
  startsAt?: string;
  createdAt: string;
  items?: { name: string; quantity: number }[];
  description?: string;
};
const groups = {
  orders: "farming/orders",
  bookings: "transport/bookings",
  reservations: "rentals/reservations",
  deliveries: "logistics/requests",
  transport: "business-transport/requests",
};
export async function loader({ request }: Route.LoaderArgs) {
  if (demoEnabled()) {
    return data({ user: null, groups: Object.keys(groups).map(kind => ({ kind, items: [] as Activity[], error: '' })), preview: false, demo: true }, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (!configured())
    return {
      user: null,
      groups: [] as { kind: string; items: Activity[]; error: string }[],
      preview: true,
      demo: false,
    };
  const me = await api(request, "users/me");
  if (me.status === 401) return redirect("/login");
  const user = await result<{ id?: string; name: string; email: string }>(me);
  const histories = await Promise.all(
    Object.entries(groups).map(async ([kind, path]) => {
      const response = await api(request, path);
      const parsed = await result<Activity[]>(response);
      return {
        kind,
        items: parsed.data ?? [],
        error: parsed.error?.message ?? "",
      };
    }),
  );
  return data(
    { user: user.data ?? null, groups: histories, preview: false, demo: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function action({ request }: Route.ActionArgs) {
  mutationOrigin(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  if (intent === "logout") {
    const response = await api(request, "auth/logout", "POST", {});
    return redirect("/login", {
      headers: { "Set-Cookie": response.headers.get("Set-Cookie") ?? "" },
    });
  }
  if (!configured()) return data({ error: 'Use browser booking controls in local mode.' }, { status: 400 });
  const kind = String(form.get("kind"));
  const id = String(form.get("id"));
  if (
    !/^[a-f\d]{24}$/i.test(id) ||
    !["orders", "bookings", "reservations"].includes(kind)
  )
    return data({ error: "Invalid cancellation request." }, { status: 400 });
  const path =
    kind === "orders"
      ? `farming/orders/${id}/status`
      : kind === "bookings"
        ? `transport/bookings/${id}/cancel`
        : `rentals/reservations/${id}`;
  const response = await api(
    request,
    path,
    kind === "bookings" ? "POST" : "PATCH",
    kind === "bookings" ? {} : { status: "cancelled" },
  );
  const parsed = await result(response);
  return data(
    {
      error: response.ok
        ? ""
        : (parsed.error?.message ?? "Cancellation failed."),
    },
    { status: response.status },
  );
}
export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
  const loaded = await serverLoader();
  if (!loaded.demo) return loaded;
  const { currentBrowserUser } = await import('../lib/browser-auth');
  const user = await currentBrowserUser(); if (!user) throw redirect('/login');
  try {
    const { localHistory } = await import('../lib/local-bookings'); const bookings = localHistory(user.id);
    return { ...loaded, user, groups: Object.keys(groups).map(kind => ({ kind, items: bookings.filter(b => kind === 'orders' ? ['products', 'livestock'].includes(b.kind) : kind === 'bookings' ? b.kind === 'taxis' : kind === 'reservations' ? b.kind === 'trailers' : false), error: '' })) };
  } catch (error) { return { ...loaded, groups: [{ kind: 'Local bookings', items: [] as Activity[], error: error instanceof Error ? error.message : 'Browser storage is unavailable.' }] }; }
}
clientLoader.hydrate = true as const;
export function HydrateFallback() { return <Shell><div className="form-page"><p className="notice">Loading browser bookings…</p></div></Shell>; }
export async function clientAction({ request, serverAction }: Route.ClientActionArgs) {
  const form = await request.clone().formData();
  if (form.get('local') === 'true' && form.get('intent') === 'logout') { const { logoutBrowser } = await import('../lib/browser-auth'); logoutBrowser(); return redirect('/login'); }
  if (form.get('demo') !== 'true') return serverAction();
  try { const { updateLocal } = await import('../lib/local-bookings'); await updateLocal(String(form.get('id')), form.get('intent') === 'demo-status' ? String(form.get('status')) : 'cancelled'); return { error: '' }; }
  catch (error) { return { error: error instanceof Error ? error.message : 'Unable to update local booking.' }; }
}
export function meta() {
  return [{ title: "My activity | OMYQUANT" }];
}
export default function Account({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  return (
    <Shell>
      <div className="form-page">
        <span className="eyebrow">YOUR SPACE</span>
        <h1>
          {loaderData.user
            ? `Hello, ${loaderData.user.name.split(" ")[0]}.`
            : "Your next chapter starts here."}
        </h1>
        <p className="muted">
          Keep track of your orders, journeys, and reservations.
        </p>
        {!loaderData.demo && !loaderData.preview && <Link className="button outline small" to="/support">Help and complaints</Link>}
        {!loaderData.demo && !loaderData.preview && <Link className="button outline small" to="/enquiries">My seller enquiries</Link>}
        {loaderData.demo && <p className="notice">Browser demo activity · Bookings are stored in localStorage on this browser only. Trailer controls simulate a rental business. No real supplier or payment is involved.</p>}
        {loaderData.preview ? (
          <div className="empty-state">
            <Icon name="clock" size={38} />
            <h3>Everything in one place</h3>
            <p>
              Your activity will appear here once the marketplace is connected
              and you sign in.
            </p>
            <Link className="button" to="/">
              Find your next good thing <Icon name="arrow" size={16} />
            </Link>
          </div>
        ) : (
          <>
            {<Form method="post">
              <input type="hidden" name="local" value={String(loaderData.demo)}/>
              <SubmissionButton className="text-button" name="intent" value="logout">
                Sign out
              </SubmissionButton>
            </Form>}
            {actionData?.error && (
              <p role="alert" className="notice error">
                {actionData.error}
              </p>
            )}
            {loaderData.groups.map((group) => (
              <section className="form-panel" id={group.kind} key={group.kind}>
                <h2 style={{ textTransform: "capitalize" }}>{group.kind}</h2>
                {group.error && <p className="notice error">{group.error}</p>}
                {!group.error && group.items.length === 0 && (
                  <p className="muted">
                    No {group.kind} yet.{" "}
                    <Link to="/">Explore the marketplace →</Link>
                  </p>
                )}
                {group.items.map((item) => (
                  <div className="activity-card" key={item._id}>
                    <div className="activity-row">
                      <div>
                        <h3>
                          {item.items
                            ?.map((i) => `${i.name} × ${i.quantity}`)
                            .join(", ") ??
                            item.description ??
                            `${group.kind === "bookings" ? `${item.seats} passenger seat(s)` : group.kind === "reservations" ? "Trailer reservation" : "Transport request"}`}
                        </h3>
                        <p className="muted">
                          Ref. {item._id.slice(-8).toUpperCase()} ·{" "}
                          {new Date(item.createdAt).toLocaleDateString(
                            "en-ZA",
                            { timeZone: "Africa/Johannesburg" },
                          )}
                          {item.total != null && ` · ${zar(item.total)}`}
                        </p>
                      </div>
                      <span className="status-pill">
                        {item.status.replaceAll("_", " ")}
                      </span>
                      {!loaderData.demo && group.kind === 'deliveries' && <Link className="text-button" to={`/deliveries/${item._id}`}>View delivery quotes</Link>}
                      {!loaderData.demo && <Link className="text-button" to={`/support?${new URLSearchParams({ kind: group.kind === 'orders' ? 'order' : group.kind === 'bookings' ? 'booking' : group.kind === 'reservations' ? 'reservation' : group.kind === 'deliveries' ? 'delivery' : 'transport', reference: item._id })}`}>Report a problem</Link>}
                      {item.start && <p className="muted">Collection: {new Date(item.start).toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</p>}
                      {group.kind === 'bookings' && 'startsAt' in item && item.startsAt && <p className="muted">Departure: {new Date(item.startsAt).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })} (South African time)</p>}
                      {loaderData.demo && group.kind === 'reservations' && ['requested', 'confirmed', 'picked_up'].includes(item.status) && <Form method="post"><input type="hidden" name="demo" value="true"/><input type="hidden" name="intent" value="demo-status"/><input type="hidden" name="id" value={item._id}/><SubmissionButton className="button outline small" name="status" value={item.status === 'requested' ? 'confirmed' : item.status === 'confirmed' ? 'picked_up' : 'returned'} disabled={navigation.state !== 'idle'}>{item.status === 'requested' ? 'Simulate business approval' : item.status === 'confirmed' ? 'Simulate pickup' : 'Simulate return'}</SubmissionButton>{item.status === 'requested' && <SubmissionButton className="text-button" name="status" value="rejected" disabled={navigation.state !== 'idle'}>Simulate rejection</SubmissionButton>}</Form>}
                      {["orders", "bookings", "reservations"].includes(
                        group.kind,
                      ) &&
                        [
                          "placed",
                          "accepted",
                          "confirmed",
                          "requested",
                        ].includes(item.status) && (
                          <Form method="post">
                            <input type="hidden" name="demo" value={String(loaderData.demo)}/>
                            <input
                              type="hidden"
                              name="kind"
                              value={group.kind}
                            />
                            <input type="hidden" name="id" value={item._id} />
                            <SubmissionButton
                              name="intent"
                              value="cancel"
                              className="text-button"
                              disabled={navigation.state !== "idle"}
                            >
                              Cancel
                            </SubmissionButton>
                          </Form>
                        )}
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </>
        )}
      </div>
    </Shell>
  );
}
