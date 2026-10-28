import { SubmissionForm as Form, SubmissionButton } from "../submission-feedback";
import { Field } from "./fields";
import type { RecordProps } from "./types";

export function DeliveryQuote({ loaded, pending, record }: RecordProps) {
  const tool = loaded.tool;
  return (<>{tool === "deliveryRequests" && (<>
    <p>
      {record.pickup?.province} → {record.dropoff?.province}
    </p>
    <p>
      {record.goodsType} · {record.weightKg} kg
    </p>
    {loaded.writable && (<Form method="post">
      <input type="hidden" name="tool" value={tool} />
      <input type="hidden" name="intent" value="quote" />
      <input type="hidden" name="record" value={record._id} />
      <input type="hidden" name="goodsType" value={record.goodsType} />
      <Field name="price" label="Delivery quote (R)" type="number" min={0} step="0.01" />
      <SubmissionButton className="button small" disabled={pending}>
        Offer quote
      </SubmissionButton>
    </Form>)}
  </>)}</>);
}
export function DeliveryAssignment({ loaded, pending, record }: RecordProps) {
  const tool = loaded.tool;
  return (<>{loaded.writable &&
    tool === "deliveries" &&
    record.status === "assigned" && (<Form method="post">
      <input type="hidden" name="intent" value="assign" />
      <input type="hidden" name="tool" value={tool} />
      <input type="hidden" name="record" value={record._id} />
      <label>
        Vehicle
        <select name="vehicle" required>
          {loaded.vehicles.map((vehicle) => (<option key={vehicle._id} value={vehicle._id}>
            {vehicle.registration}
          </option>))}
        </select>
      </label>
      <label>
        Delivery person
        <select name="driver" required>
          {loaded.drivers.map((driver) => (<option key={driver._id} value={driver._id}>
            {driver.user}
          </option>))}
        </select>
      </label>
      <SubmissionButton className="button small" disabled={pending}>
        Assign delivery
      </SubmissionButton>
    </Form>)}</>);
}
