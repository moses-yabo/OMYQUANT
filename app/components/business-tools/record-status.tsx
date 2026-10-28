import { SubmissionForm as Form, SubmissionButton } from "../submission-feedback";
import { Field } from "./fields";
import type { RecordProps } from "./types";

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
export function RecordStatus({ loaded, pending, record }: RecordProps) {
  const tool = loaded.tool;
  const transitions = tool === "deliveries"
    ? (({
      assigned: ["collected"],
      collected: ["delivered"],
    } as Record<string, string[]>)[record.status ?? ""] ?? [])
    : tool === "orders"
      ? (orderTransitions[record.status ?? ""] ?? [])
      : tool === "reservations"
        ? (reservationTransitions[record.status ?? ""] ?? [])
        : tool === "departures"
          ? (departureTransitions[record.status ?? ""] ?? [])
          : tool === "products" || tool === "livestock"
            ? ["draft", "published", "inactive"].filter((status) => status !== record.status)
            : tool === "trailers"
              ? [record.active ? "inactive" : "active"]
              : [];
  return (<>{loaded.writable && transitions.length > 0 && (<Form method="post">
    <input type="hidden" name="tool" value={tool} />
    <input type="hidden" name="record" value={record._id} />
    <input type="hidden" name="intent" value="status" />
    <label>
      Next status
      <select name="status">
        {transitions.map((status) => (<option key={status} value={status}>
          {status.replaceAll("_", " ")}
        </option>))}
      </select>
    </label>
    {tool === "deliveries" &&
      record.status === "collected" && (<Field name="proof" label="Proof of delivery URL" type="url" />)}
    <SubmissionButton className="button small" disabled={pending}>
      Update status
    </SubmissionButton>
  </Form>)}</>);
}
