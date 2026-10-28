import { Link, useNavigation, useNavigate } from "react-router";
import type { Route } from "./+types/business-tools";
import { Shell } from "../components/shell";
import { businessToolLabels } from "../lib/business-tools";
import { loadBusinessTools, saveBusinessTool } from "../.server/route-handlers/business-tools";
import { BusinessOverview } from "../components/business-tools/overview";
import { CreateBusinessRecord } from "../components/business-tools/create-form";
import { BusinessRecords } from "../components/business-tools/records-panel";

export async function loader(args: Route.LoaderArgs) {
  return loadBusinessTools(args);
}
export async function action(args: Route.ActionArgs) {
  return saveBusinessTool(args);
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
export default function BusinessTools({ loaderData: loaded, actionData, }: Route.ComponentProps) {
  const pending = useNavigation().state !== "idle";
  const navigate = useNavigate();
  const tool = loaded.tool;
  const listing = ["products", "livestock", "trailers"].includes(tool);
  const create = loaded.writable &&
    (listing ||
      [
        "vehicles",
        "routes",
        "departures",
        "drivers",
        "deliveryVehicles",
        "deliveryPersonnel",
      ].includes(tool));
  return (<Shell workspace={{ business: loaded.business, available: loaded.available }}>
    <div className="form-page">
      <Link className="text-button" to="/business?view=all">
        Back to My business
      </Link>
      <h1>{loaded.business.name}</h1>
      <label>
        Switch business
        <select value={loaded.business._id} onChange={(event) => navigate(`/business/${event.target.value}/tools`)}>
          {loaded.businesses.map((business) => (<option key={business._id} value={business._id}>
            {business.name}
          </option>))}
        </select>
      </label>
      <Link className="button outline small" to={`/business/${loaded.business._id}/profile`}>
        Business profile and team
      </Link>
      <p className="muted">
        Verified business tools. Access follows your membership and the
        services this business offers.
      </p>
      <Link className="button outline small" to="/support">
        Help and complaints
      </Link>
      <nav className="category-tabs" aria-label="Business services">
        <Link className={`tab ${loaded.overview ? "active" : ""}`} to="?">
          Overview
        </Link>
        {loaded.available.map((key) => (<Link key={key} className={`tab ${!loaded.overview && key === tool ? "active" : ""}`} aria-current={key === tool ? "page" : undefined} to={`?tool=${key}`}>
          {businessToolLabels[key]}
        </Link>))}
      </nav>
      {actionData?.error && (<p role="alert" className="notice error">
        {actionData.error}
      </p>)}
      {actionData?.success && (<p role="status" className="notice">
        {actionData.success}
      </p>)}
        {loaded.overview ? (<BusinessOverview loaded={loaded} />) : (<>
        <BusinessRecords loaded={loaded} pending={pending} />
        {create && (<CreateBusinessRecord loaded={loaded} pending={pending} />)}
      </>)}
    </div>
  </Shell>);
}
