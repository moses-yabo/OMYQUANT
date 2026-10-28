import { SubmissionForm as Form, SubmissionButton } from "../submission-feedback";
import type { RecordProps } from "./types";

export function EditBusinessRecord({ loaded, pending, record }: RecordProps) {
  const tool = loaded.tool;
  const listing = ["products", "livestock", "trailers"].includes(tool);
  return (<>{loaded.writable &&
    (listing ||
      [
        "vehicles",
        "deliveryVehicles",
        "drivers",
        "deliveryPersonnel",
      ].includes(tool)) && (<details>
        <summary>Edit details</summary>
        <Form method="post">
          <input type="hidden" name="intent" value="edit" />
          <input type="hidden" name="record" value={record._id} />
          <input type="hidden" name="tool" value={tool} />
          {listing ? (<>
            <label>
              Name
              <input name="name" defaultValue={record.name} required />
            </label>
            <label>
              {tool === "trailers"
                ? "Daily price (R)"
                : "Price (R)"}
              <input name="price" type="number" min="0" step="0.01" defaultValue={(record.dailyPrice ?? record.price ?? 0) /
                100} required />
            </label>
            {tool !== "trailers" ? (<label>
              Quantity
              <input name="quantity" type="number" min="0" defaultValue={record.quantity} required />
            </label>) : (<>
              <label>
                Hourly price (R, optional)
                <input name="hourlyPrice" type="number" min="0" step="0.01" defaultValue={record.hourlyPrice === undefined
                  ? ""
                  : record.hourlyPrice / 100} />
              </label>
              <label>
                Monthly price (R, optional)
                <input name="monthlyPrice" type="number" min="0" step="0.01" defaultValue={record.monthlyPrice === undefined
                  ? ""
                  : record.monthlyPrice / 100} />
              </label>
            </>)}
          </>) : (<>
            <label>
              Availability
              <select name="active" defaultValue={String(record.active !== false)}>
                <option value="true">Available</option>
                <option value="false">Unavailable</option>
              </select>
            </label>
            {["vehicles", "deliveryVehicles"].includes(tool) && (<label>
              Assign driver
              <select name="driver" defaultValue={record.driver ?? ""}>
                <option value="">
                  Keep current assignment
                </option>
                {loaded.drivers.map((driver) => (<option key={driver._id} value={driver._id}>
                  {driver.user}
                </option>))}
              </select>
            </label>)}
          </>)}
          <SubmissionButton className="button small" disabled={pending}>
            Save details
          </SubmissionButton>
        </Form>
      </details>)}</>);
}
