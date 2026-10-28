import { Link } from "react-router";
import { businessToolLabels } from "../../lib/business-tools";
import { zar } from "../../lib/marketplace";
import type { ToolDataProps } from "./types";

export function BusinessOverview({ loaded }: ToolDataProps) {
  return (<section className="form-panel">
    <h2>Business statistics</h2>
    <p className="muted">
      All-time records for {loaded.business.name}, with current upcoming
      and active work shown separately.
    </p>
    <div className="form-grid">
      {loaded.statistics.map((statistic) => (<Link className="activity-card" key={`${statistic.tool}-${statistic.label ?? statistic.detail}`} to={`?tool=${statistic.tool}`}>
        <h3>
          {statistic.label ?? businessToolLabels[statistic.tool]}
        </h3>
        <strong>
          {statistic.format === "money"
            ? zar(statistic.count)
            : statistic.count}
        </strong>
        <p className="muted">{statistic.detail}</p>
      </Link>))}
    </div>
    <p className="notice">
      Profit / loss: unavailable. Transaction values are not profit.
      Operating costs, refunds and complete payment receipts are not
      recorded, so gains and losses cannot yet be calculated reliably.
      Cancelled values are shown separately and are not treated as
      losses.
    </p>
  </section>);
}
