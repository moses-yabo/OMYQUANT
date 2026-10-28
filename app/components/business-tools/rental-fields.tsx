import { Field } from "./fields";
import type { ToolDataProps } from "./types";

export function TrailerRateFields({ loaded }: ToolDataProps) {
  const tool = loaded.tool;
  return (<>{tool === "trailers" && (<>
    <label>
      Hourly price (R, optional)
      <input name="hourlyPrice" type="number" min="0" step="0.01" />
    </label>
    <label>
      Monthly price (R, optional)
      <input name="monthlyPrice" type="number" min="0" step="0.01" />
    </label>
  </>)}</>);
}
export function TrailerDimensions({ loaded }: ToolDataProps) {
  const tool = loaded.tool;
  return (<>{tool === "trailers" && (<>
    <Field name="trailerType" label="Trailer type" />
    <Field name="payloadKg" label="Payload (kg)" type="number" min={0.01} step="any" />
    {["length", "width", "height"].map((name) => (<Field key={name} name={name} label={`${name} (metres)`} type="number" min={0.01} step="any" />))}
  </>)}</>);
}
