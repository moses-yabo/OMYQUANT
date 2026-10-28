import { Link } from "react-router";
import { zar } from "../../lib/marketplace";
import { TAXI_PASSENGER_CAPACITY, taxiSeatsAvailable } from "../../lib/taxi-capacity";
import { DeliveryQuote, DeliveryAssignment } from "./logistics-record";
import { CustomerEnquiry } from "./farming-record";
import { EditBusinessRecord } from "./edit-record";
import { RecordStatus } from "./record-status";
import type { RecordProps } from "./types";

export function BusinessRecord({ loaded, pending, record }: RecordProps) {
  const tool = loaded.tool;
  return (<article className="activity-card" key={record._id}>
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
    <DeliveryQuote loaded={loaded} pending={pending} record={record} />
    <CustomerEnquiry loaded={loaded} pending={pending} record={record} />
    <EditBusinessRecord loaded={loaded} pending={pending} record={record} />
    <DeliveryAssignment loaded={loaded} pending={pending} record={record} />
    {record.items?.map((item, index) => (<p key={index}>
      {item.quantity} × {item.name}
    </p>))}
    {record.quantity !== undefined && (<p>Stock: {record.quantity}</p>)}
    {record.seats !== undefined && (<p>Seats booked: {record.seats}</p>)}
    {record.remaining !== undefined && (<p>
      Seats available:{" "}
      {taxiSeatsAvailable(record.capacity ?? TAXI_PASSENGER_CAPACITY, record.remaining)}{" "}
      /{" "}
      {Math.min(record.capacity ?? TAXI_PASSENGER_CAPACITY, TAXI_PASSENGER_CAPACITY)}
    </p>)}
    {(record.dailyPrice ?? record.price ?? record.total) !==
      undefined && (<p>
        {zar(record.dailyPrice ??
          record.price ??
          record.total ??
          0)}
        {tool === "trailers" ? " / day" : ""}
      </p>)}
    {record.start && (<p>
      {new Date(record.start).toLocaleString("en-ZA", {
        timeZone: "Africa/Johannesburg",
      })}{" "}
      to{" "}
      {new Date(record.end!).toLocaleString("en-ZA", {
        timeZone: "Africa/Johannesburg",
      })}
    </p>)}
    {record.startsAt && (<p>
      {new Date(record.startsAt).toLocaleString("en-ZA", {
        timeZone: "Africa/Johannesburg",
      })}
    </p>)}
    {record.trailer && (<p className="muted">Trailer: {record.trailer}</p>)}
    {record.departure && (<p className="muted">Departure: {record.departure}</p>)}
    {[
      "orders",
      "reservations",
      "bookings",
      "deliveries",
      "transportRequests",
    ].includes(tool) && (<Link className="text-button" to={`/support?${new URLSearchParams({ kind: tool === "orders" ? "order" : tool === "reservations" ? "reservation" : tool === "bookings" ? "booking" : tool === "deliveries" ? "delivery" : "transport", reference: record._id })}`}>
      Report a problem
    </Link>)}
    <RecordStatus loaded={loaded} pending={pending} record={record} />
  </article>);
}
