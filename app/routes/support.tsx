import { SubmissionForm as Form, SubmissionButton } from "../components/submission-feedback";
import { data, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/support";
import { Shell } from "../components/shell";
import { api, configured, mutationOrigin, result } from "../.server/frontend";
import { requireAdminPage } from "../.server/admin-access";
import { authenticate, sessionToken } from "../.server/modules/auth/auth";
import { connectToDatabase } from "../.server/database/connect";
import { ApiError } from "../.server/shared/http";
import { complaintCategories, complaintStatuses } from "../lib/support";
import { SupportLiveUpdates } from "../components/support-live-updates";

type Ticket = {
  _id: string;
  subject: string;
  description: string;
  category: keyof typeof complaintCategories;
  status: keyof typeof complaintStatuses;
  version: number;
  createdAt: string;
  updatedAt: string;
  relatedKind?: string;
  relatedId?: string;
  reporter?: { name: string } | null;
  history: {
    _id: string;
    author?: { name: string } | null;
    text: string;
    internal: boolean;
    status?: keyof typeof complaintStatuses;
    createdAt: string;
  }[];
};
type Queue = { tickets: Ticket[]; total: number; page: number; limit: number };
async function guard(request: Request, administrative: boolean) {
  if (administrative) return requireAdminPage(request);
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
  const url = new URL(request.url);
  const administrative = url.pathname.startsWith("/admin/");
  const status =
    url.searchParams.get("status") ?? (administrative ? "active" : "all");
  const category = url.searchParams.get("category") ?? "";
  const empty = {
    administrative,
    status,
    category,
    tickets: [] as Ticket[],
    ticket: null as Ticket | null,
    total: 0,
    page: 1,
    limit: 20,
    preview: !configured(),
    kind: url.searchParams.get("kind") ?? "",
    reference: url.searchParams.get("reference") ?? "",
    saved: url.searchParams.get("saved") === "1",
  };
  if (!configured() && !administrative) return empty;
  await guard(request, administrative);
  const path = `${administrative ? "admin/" : ""}support`;
  const response = await api(
    request,
    params.id
      ? `${path}/${params.id}`
      : `${path}?${new URLSearchParams({ status, category, page: url.searchParams.get("page") ?? "1", limit: "20" })}`,
  );
  const payload = await result<Ticket | Queue>(response);
  if (!response.ok || !payload.data)
    throw new Response(payload.error?.message ?? "Unable to load support.", {
      status: response.status,
    });
  return data(
    params.id
      ? { ...empty, ticket: payload.data as Ticket }
      : { ...empty, ...(payload.data as Queue) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function action({ request, params }: Route.ActionArgs) {
  mutationOrigin(request);
  const administrative = new URL(request.url).pathname.startsWith("/admin/");
  if (!configured())
    return data(
      { error: "Support requires a connected marketplace account." },
      { status: 503 },
    );
  await guard(request, administrative);
  if (request.method !== "POST")
    throw new Response("Method not allowed.", { status: 405 });
  // Text only: enforce a small body limit before reading user submissions.
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader)
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        return data({ error: "Complaint text is too large." }, { status: 413 });
      }
      chunks.push(value);
    }
  const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  const get = (key: string) => form.get(key) ?? "";
  const base = `${administrative ? "admin/" : ""}support`;
  if (!params.id && administrative)
    throw new Response("Method not allowed.", { status: 405 });
  const payload = params.id
    ? {
        message: get("message"),
        version: Number(get("version")),
        ...(administrative
          ? {
              internal: get("internal") === "true",
              ...(get("status") ? { status: get("status") } : {}),
            }
          : {}),
      }
    : {
        subject: get("subject"),
        description: get("description"),
        category: get("category"),
        ...(get("relatedKind") ? { relatedKind: get("relatedKind") } : {}),
        ...(get("relatedId") ? { relatedId: get("relatedId") } : {}),
      };
  const response = await api(
    request,
    params.id ? `${base}/${params.id}` : base,
    params.id ? "PATCH" : "POST",
    payload,
  );
  const parsed = await result<{ _id: string }>(response);
  if (!response.ok)
    return data(
      {
        error:
          parsed.error?.issues?.map((issue) => issue.message).join("; ") ||
          parsed.error?.message ||
          "Unable to save complaint.",
      },
      { status: response.status },
    );
  return redirect(`/${base}/${params.id ?? parsed.data?._id}?saved=1`);
}
export function headers() {
  return { "Cache-Control": "no-store" };
}
export function meta() {
  return [
    { title: "Support and complaints | OMYQUANT" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}
const formatDate = (value: string) =>
  new Date(value).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" });
export default function Support({
  loaderData: loaded,
  actionData,
}: Route.ComponentProps) {
  const pending = useNavigation().state !== "idle";
  const ticket = loaded.ticket;
  const base = loaded.administrative ? "/admin/support" : "/support";
  const pageLink = (page: number) =>
    `${base}?${new URLSearchParams({ status: loaded.status, category: loaded.category, page: String(page) })}`;
  return (
    <Shell>
      <div className="form-page">
        <span className="eyebrow">
          {loaded.administrative
            ? "CUSTOMER AND BUSINESS SUPPORT"
            : "WE ARE HERE TO HELP"}
        </span>
        <h1>
          {loaded.administrative ? "Support complaints" : "Help and complaints"}
        </h1>
        <p className="muted">
          {loaded.administrative
            ? "Review customer and business reports, investigate issues and record the outcome."
            : "Report a delivery, booking, rental, farm goods or livestock problem. Track replies here."}
        </p>
        {loaded.preview && (
          <p className="notice">
            Support is available with a connected marketplace account. Browser
            demo complaints are not sent to administrators.
          </p>
        )}
        {!loaded.preview && <SupportLiveUpdates />}
        {actionData?.error && (
          <p className="notice error" role="alert">
            {actionData.error}
          </p>
        )}
        {loaded.saved && (
          <p className="notice" role="status">
            {ticket ? "Your update has been saved." : "Complaint submitted."}
          </p>
        )}
        {ticket ? (
          <>
            <Link className="text-button" to={base}>
              Back to complaints
            </Link>
            <section className="form-panel">
              <h2>{ticket.subject}</h2>
              <p className="status-pill">{complaintStatuses[ticket.status]}</p>
              <p className="muted">
                {complaintCategories[ticket.category]} ·{" "}
                {formatDate(ticket.createdAt)} · Reference: {ticket._id}
              </p>
              {loaded.administrative && (
                <p>
                  Reported by: {ticket.reporter?.name ?? "Account unavailable"}
                </p>
              )}
              <p style={{ whiteSpace: "pre-wrap" }}>{ticket.description}</p>
              {ticket.relatedId && (
                <p className="muted">
                  Related {ticket.relatedKind}: {ticket.relatedId}
                </p>
              )}
            </section>
            <section className="form-panel">
              <h2>Conversation and progress</h2>
              {!ticket.history.length && (
                <p className="muted">No replies yet.</p>
              )}
              {ticket.history.map((event) => (
                <article key={event._id} className="activity-card">
                  <h3>
                    {event.internal ? "Internal staff note" : "Reply"} ·{" "}
                    {event.author?.name ?? "Account unavailable"}
                  </h3>
                  <p className="muted">
                    {formatDate(event.createdAt)}
                    {event.status
                      ? ` · ${complaintStatuses[event.status]}`
                      : ""}
                  </p>
                  <p style={{ whiteSpace: "pre-wrap" }}>{event.text}</p>
                </article>
              ))}
              <Form key={ticket._id} method="post" resetOnSuccess>
                <input type="hidden" name="version" value={ticket.version} />
                {loaded.administrative && (
                  <div className="form-grid">
                    <label>
                      Complaint status
                      <select name="status" defaultValue={ticket.status}>
                        {Object.entries(complaintStatuses).map(
                          ([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label>
                      Reply visibility
                      <select name="internal">
                        <option value="false">Public reply to reporter</option>
                        <option value="true">Internal staff note</option>
                      </select>
                    </label>
                  </div>
                )}
                <label>
                  {loaded.administrative
                    ? "Reply or review note"
                    : "Add information or reply"}
                  <textarea
                    name="message"
                    minLength={1}
                    maxLength={4000}
                    required
                  />
                </label>
                <SubmissionButton className="button full" disabled={pending}>
                  {pending ? "Saving…" : "Save update"}
                </SubmissionButton>
              </Form>
            </section>
          </>
        ) : (
          <>
            <Form method="get" className="form-panel">
              <div className="form-grid">
                <label>
                  Status
                  <select name="status" defaultValue={loaded.status}>
                    <option value="active">Open and under review</option>
                    <option value="all">All statuses</option>
                    {Object.entries(complaintStatuses).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Complaint category
                  <select name="category" defaultValue={loaded.category}>
                    <option value="">All categories</option>
                    {Object.entries(complaintCategories).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>
              <SubmissionButton
                className="button small"
                disabled={loaded.preview || pending}
              >
                Filter complaints
              </SubmissionButton>
            </Form>
            <section className="form-panel">
              <h2>
                {loaded.administrative ? "Complaint queue" : "Your complaints"}{" "}
                ({loaded.total})
              </h2>
              {!loaded.tickets.length && (
                <p className="muted">No complaints match these filters.</p>
              )}
              {loaded.tickets.map((item) => (
                <article className="activity-card" key={item._id}>
                  <h3>{item.subject}</h3>
                  <p className="muted">
                    {complaintCategories[item.category]} ·{" "}
                    {complaintStatuses[item.status]} · Updated{" "}
                    {formatDate(item.updatedAt)}
                  </p>
                  <Link
                    className="button outline small"
                    to={`${base}/${item._id}`}
                  >
                    Open complaint
                  </Link>
                </article>
              ))}
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
            {!loaded.administrative && (
              <Form method="post" className="form-panel">
                <h2>Report a problem</h2>
                <label>
                  Category
                  <select name="category" required>
                    {Object.entries(complaintCategories).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Subject
                  <input
                    name="subject"
                    required
                    minLength={3}
                    maxLength={160}
                  />
                </label>
                <label>
                  What happened?
                  <textarea
                    name="description"
                    required
                    minLength={10}
                    maxLength={4000}
                  />
                </label>
                <div className="form-grid">
                  <label>
                    Related transaction (optional)
                    <select name="relatedKind" defaultValue={loaded.kind}>
                      <option value="">No linked transaction</option>
                      {[
                        "order",
                        "booking",
                        "reservation",
                        "delivery",
                        "transport",
                      ].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Full transaction reference (optional)
                    <input
                      name="relatedId"
                      defaultValue={loaded.reference}
                      pattern="[a-fA-F0-9]{24}"
                      maxLength={24}
                    />
                  </label>
                </div>
                <p className="muted">
                  Only link your own transaction or one belonging to your
                  business. Do not include passwords, card details or other
                  private credentials.
                </p>
                <SubmissionButton
                  className="button full"
                  disabled={loaded.preview || pending}
                >
                  {pending ? "Submitting…" : "Submit complaint"}
                </SubmissionButton>
              </Form>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}
