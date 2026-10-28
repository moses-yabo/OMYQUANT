import { Field } from "./fields";
import type { ToolDataProps } from "./types";

export function FarmListingFields({ loaded }: ToolDataProps) {
  const tool = loaded.tool;
  return (<>{(tool === "products" || tool === "livestock") && (<>
    <Field name="description" label="Description" />
    <Field name="quantity" label="Quantity available" type="number" min={0} step="1" />
    <label>
      Listing status
      <select name="status">
        <option value="draft">Draft</option>
        <option value="published">Published</option>
      </select>
    </label>
  </>)}</>);
}
export function ProductFields({ loaded }: ToolDataProps) {
  const tool = loaded.tool;
  return (<>{tool === "products" && (<>
    <Field name="unit" label="Unit (kg, bag, box)" />
    <label>
      Category
      <select name="category">
        {[
          "produce",
          "feed",
          "hay_straw",
          "equipment",
          "supplies",
          "other",
        ].map((value) => (<option key={value}>{value}</option>))}
      </select>
    </label>
  </>)}</>);
}
export function LivestockFields({ loaded }: ToolDataProps) {
  const tool = loaded.tool;
  return (<>{tool === "livestock" && (<>
    <Field name="animalCategory" label="Animal (cattle, sheep, chicken, goat)" />
    <Field name="breed" label="Breed" />
    <Field name="ageMonths" label="Age in months" type="number" min={0} step="1" />
    <label>
      Sex
      <select name="sex">
        {["unknown", "male", "female", "mixed"].map((value) => (<option key={value}>{value}</option>))}
      </select>
    </label>
  </>)}</>);
}
