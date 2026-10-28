import { TAXI_PASSENGER_CAPACITY } from "../../lib/taxi-capacity";
import { Field, Place } from "./fields";
import type { ToolDataProps } from "./types";

export function DriverFields({ loaded }: ToolDataProps) {
  const tool = loaded.tool;
  return (<>{["drivers", "deliveryPersonnel"].includes(tool) && (<Field name="user" label="Existing driver account ID" />)}</>);
}
export function TaxiRouteFields({ loaded }: ToolDataProps) {
  const tool = loaded.tool;
  return (<>{tool === "routes" && (<>
    <Place dropoff />
    <label>
      Route type
      <select name="mode">
        <option value="long_distance">Long distance</option>
        <option value="local">Local</option>
      </select>
    </label>
  </>)}</>);
}
export function TaxiVehicleFields({ loaded }: ToolDataProps) {
  const tool = loaded.tool;
  return (<>{tool === "vehicles" && (<>
    <Field name="registration" label="Vehicle registration" />
    <label>
      Passenger seats (excluding driver)
      <input name="capacity" type="number" min={1} max={TAXI_PASSENGER_CAPACITY} defaultValue={TAXI_PASSENGER_CAPACITY} step="1" required />
      <span className="muted">
        Up to 15 passengers per taxi. Use fewer seats if the
        vehicle has a lower capacity.
      </span>
    </label>
  </>)}</>);
}
export function DepartureFields({ loaded }: ToolDataProps) {
  const tool = loaded.tool;
  return (<>{tool === "departures" && (<>
    <label>
      Vehicle
      <select name="vehicle" required>
        <option value="">Select vehicle</option>
        {loaded.vehicles.map((vehicle) => (<option key={vehicle._id} value={vehicle._id}>
          {vehicle.registration}
        </option>))}
      </select>
    </label>
    <label>
      Route
      <select name="route" required>
        <option value="">Select route</option>
        {loaded.routes.map((route) => (<option key={route._id} value={route._id}>
          {route.name}
        </option>))}
      </select>
    </label>
    <Field name="startsAt" label="Departure time (South African time)" type="datetime-local" />
  </>)}</>);
}
