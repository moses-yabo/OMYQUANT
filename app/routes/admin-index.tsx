import { data, Link, redirect } from "react-router";
import type { Route } from "./+types/admin-index";
import { requireAdminPage } from "../.server/admin-access";
import { administrationOverview } from "../.server/modules/admin";
import { Shell } from "../components/shell";
import "./admin-overview.css";

type Review = {
  _id: string;
  verified: boolean;
  createdAt: string;
  business?: { _id: string; name: string } | null;
  reviewer?: { name: string } | null;
};
export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requireAdminPage(request);
  if (!actor.superAdmin) throw redirect("/admin/businesses");
  const overview = await administrationOverview(actor);
  return data(
    JSON.parse(JSON.stringify(overview)) as {
      pending: number;
      verified: number;
      administrators: number;
      recent: Review[];
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export function headers() {
  return { "Cache-Control": "no-store" };
}
export function meta() {
  return [
    { title: "Super administrator workspace | OMYQUANT" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}
export default function AdministrationOverview({
  loaderData,
}: Route.ComponentProps) {
  return (
    <Shell>
      <div className="form-page admin-overview">
        <span className="eyebrow">SUPER ADMINISTRATION</span>
        <h1>Your administration workspace.</h1>
        <p className="muted">
          Review business applications and manage the people who help oversee
          OMYQUANT.
        </p>
        <div className="admin-overview-stats">
          <Link className="form-panel" to="/admin/businesses?status=pending">
            <strong>{loaderData.pending}</strong>
            <span>Businesses awaiting verification</span>
          </Link>
          <Link className="form-panel" to="/admin/businesses?status=verified">
            <strong>{loaderData.verified}</strong>
            <span>Verified businesses</span>
          </Link>
          <Link className="form-panel" to="/admin/users">
            <strong>{loaderData.administrators}</strong>
            <span>Active regular administrators</span>
          </Link>
        </div>
    <section className="form-panel"><h2>Customer and business support</h2><p className="muted">Investigate broken or late deliveries, spoiled farm goods, sick livestock, booking problems and rental complaints. Reply to reporters and record private investigation notes.</p><Link className="button" to="/admin/support">Review support complaints</Link></section>
        <section className="form-panel">
          <h2>Your responsibilities</h2>
          <div className="admin-overview-actions">
            <div>
              <h3>Review businesses</h3>
              <p className="muted">
                Check business details, record a review note and approve
                eligible businesses. Verification unlocks their service tools.
              </p>
              <Link className="button" to="/admin/businesses">
                Verify businesses
              </Link>
            </div>
            <div>
              <h3>Manage administrator access</h3>
              <p className="muted">
                Find an existing account by email, then grant or revoke regular
                administrator access.
              </p>
              <Link className="button outline" to="/admin/users">
                Manage administrators
              </Link>
            </div>
          </div>
        </section>
        <section className="form-panel">
          <h2>Recent business decisions</h2>
          {!loaderData.recent.length && (
            <p className="muted">
              No recorded verification decisions yet. Start with the pending
              review queue.
            </p>
          )}
          {loaderData.recent.map((review) => (
            <article className="activity-card" key={review._id}>
              <h3>{review.business?.name ?? "Business no longer available"}</h3>
              <p>
                {review.verified
                  ? "Verified"
                  : "Returned to pending verification"}
              </p>
              <p className="muted">
                {review.reviewer?.name ?? "Administrator"} ·{" "}
                {new Date(review.createdAt).toLocaleString("en-ZA", {
                  timeZone: "Africa/Johannesburg",
                })}
              </p>
              {review.business && (
                <Link
                  className="text-button"
                  to={`/admin/businesses/${review.business._id}`}
                >
                  View business review
                </Link>
              )}
            </article>
          ))}
        </section>
      </div>
    </Shell>
  );
}
