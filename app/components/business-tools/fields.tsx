

export function Field({ name, label, type = "text", min, step, }: {
  name: string;
  label: string;
  type?: string;
  min?: number;
  step?: string;
}) {
  return (<label>
    {label}
    <input name={name} type={type} min={min} step={step} required />
  </label>);
}
export function Place({ dropoff = false }: {
  dropoff?: boolean;
}) {
  return (<>
    <Field name={dropoff ? "dropoffAddress" : "address"} label={dropoff ? "Destination address" : "Address"} />
    <Field name={dropoff ? "dropoffProvince" : "province"} label={dropoff ? "Destination province" : "Province"} />
  </>);
}
