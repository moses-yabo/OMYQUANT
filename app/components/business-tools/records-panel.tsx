import { Link } from "react-router";
import { businessToolLabels } from "../../lib/business-tools";
import { BusinessRecord } from "./record-card";
import type { ViewProps } from "./types";

export function BusinessRecords({ loaded, pending }: ViewProps) {
  const tool = loaded.tool;
  const pageLink = (page: number) => `?${new URLSearchParams({ tool, page: String(page) })}`;
  return (<section className="form-panel">
    <h2>
      {businessToolLabels[tool]} ({loaded.total})
    </h2>
    {tool === "reservations" && (<p className="muted">
      Requested: awaiting approval. Confirmed: reserved. Picked up:
      currently rented. Confirming checks for overlapping
      reservations.
    </p>)}
    {!loaded.records.length && (<p className="muted">No records yet.</p>)}
    {loaded.records.map(record => <BusinessRecord key={record._id} loaded={loaded} pending={pending} record={record} />)}
    {loaded.page > 1 && (<Link className="button outline small" to={pageLink(loaded.page - 1)}>
      Previous
    </Link>)}
    {loaded.page * loaded.limit < loaded.total && (<Link className="button outline small" to={pageLink(loaded.page + 1)}>
      Next
    </Link>)}
  </section>);
}
