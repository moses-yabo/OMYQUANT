import { SubmissionForm as Form, SubmissionButton } from "../submission-feedback";
import { Field, Place } from "./fields";
import { DriverFields, TaxiRouteFields, TaxiVehicleFields, DepartureFields } from "./transport-fields";
import { DeliveryVehicleFields } from "./logistics-fields";
import { TrailerRateFields, TrailerDimensions } from "./rental-fields";
import { FarmListingFields, ProductFields, LivestockFields } from "./farming-fields";
import type { ViewProps } from "./types";

export function CreateBusinessRecord({ loaded, pending }: ViewProps) {
  const tool = loaded.tool;
  const listing = ["products", "livestock", "trailers"].includes(tool);
  return (<Form key={tool} resetOnSuccess method="post" encType="multipart/form-data" className="form-panel">
    <h2>
      Add{" "}
      {tool === "livestock" ? "livestock" : tool === "products" ? "product" : tool === "trailers" ? "trailer" : tool === "drivers" || tool === "deliveryPersonnel" ? "driver" : tool === "vehicles" || tool === "deliveryVehicles" ? "vehicle" : tool === "routes" ? "route" : "departure"}
    </h2>
    <input type="hidden" name="tool" value={tool} />
    <input type="hidden" name="intent" value="create" />
    <div className="form-grid">
      <DriverFields loaded={loaded} />
      <DeliveryVehicleFields loaded={loaded} />
      <TrailerRateFields loaded={loaded} />
      {(listing || tool === "routes") && (<Field name="name" label="Name" />)}
      <FarmListingFields loaded={loaded} />
      {(listing || tool === "departures") && (<Field name="price" label={tool === "trailers" ? "Daily price (R)" : "Price (R)"} type="number" min={0} step="0.01" />)}
      <ProductFields loaded={loaded} />
      <LivestockFields loaded={loaded} />
      <TrailerDimensions loaded={loaded} />
      {(listing || tool === "routes") && <Place />}
      <TaxiRouteFields loaded={loaded} />
      <TaxiVehicleFields loaded={loaded} />
      <DepartureFields loaded={loaded} />
    </div>
    {listing && (<label>
      Image (optional, up to 5 MiB)
      <input type="file" name="imageFile" accept="image/png,image/jpeg,image/gif,image/webp" />
    </label>)}
    {tool === "departures" &&
      (!loaded.vehicles.length || !loaded.routes.length) && (<p className="notice">
        Add a vehicle and route before scheduling a departure.
      </p>)}
    <SubmissionButton className="button full" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </SubmissionButton>
  </Form>);
}
