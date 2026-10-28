import { Field } from "./fields";
import type { ToolDataProps } from "./types";

export function DeliveryVehicleFields({ loaded }: ToolDataProps) {
  const tool = loaded.tool;
  return (<>{tool === "deliveryVehicles" && (<>
    <Field name="registration" label="Vehicle registration" />
    <Field name="payloadKg" label="Payload (kg)" type="number" min={1} step="any" />
  </>)}</>);
}
