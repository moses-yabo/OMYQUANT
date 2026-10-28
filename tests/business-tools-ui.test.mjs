import { expect, test } from "@jest/globals";
import { renderBusinessTools, toolNames } from "./helpers/business-tools-render.mjs";

const record = { _id: "f".repeat(24), name: "Existing record", active: true };

test.each([
  ["products", ["name", "description", "quantity", "category", "unit", "imageFile"], ["animalCategory", "capacity", "hourlyPrice"]],
  ["livestock", ["animalCategory", "breed", "ageMonths", "sex", "quantity", "imageFile"], ["category", "unit", "capacity"]],
  ["trailers", ["trailerType", "dailyPrice", "hourlyPrice", "monthlyPrice", "payloadKg", "imageFile"], ["quantity", "capacity", "animalCategory"]],
  ["vehicles", ["registration", "capacity"], ["payloadKg", "imageFile"]],
  ["routes", ["name", "address", "dropoffAddress", "mode"], ["capacity", "imageFile"]],
  ["departures", ["vehicle", "route", "startsAt", "price"], ["imageFile", "capacity"]],
  ["drivers", ["user"], ["capacity", "imageFile"]],
  ["deliveryVehicles", ["registration", "payloadKg"], ["capacity", "imageFile"]],
  ["deliveryPersonnel", ["user"], ["capacity", "imageFile"]],
])("%s creation retains its own fields and multipart submission", (tool, required, absent) => {
  const html = renderBusinessTools(tool);
  const form = [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].map(match => match[0]).find(markup => markup.includes('name="intent" value="create"'));
  expect(form).toBeDefined();
  expect(form).toContain('encType="multipart/form-data"');
  expect(form).toContain(`name="tool" value="${tool}"`);
  // Trailer daily pricing uses the shared price field in the existing action contract.
  for (const name of required) expect(form).toContain(`name="${name === "dailyPrice" ? "price" : name}"`);
  for (const name of absent) expect(form).not.toContain(`name="${name}"`);
});

test.each(toolNames)("%s read-only membership hides mutation forms", tool => {
  const html = renderBusinessTools(tool, { writable: false, records: [{ ...record, status: "assigned", goodsType: "parcel" }] });
  expect(html).toContain("Existing record");
  expect(html).not.toMatch(/name="intent" value="(?:create|edit|status|assign|reply|quote)"/);
});

test("taxi capacity limits, route choices and scheduling prerequisites remain visible", () => {
  const capacity = renderBusinessTools("vehicles").match(/<input\b[^>]*name="capacity"[^>]*>/)?.[0];
  expect(capacity).toContain('max="15"');
  expect(capacity).toContain('value="15"');
  const departure = renderBusinessTools("departures");
  expect(departure).toContain("TEST GP");
  expect(departure).toContain("Test route");
  expect(departure).toContain("Departure time (South African time)");
  expect(renderBusinessTools("departures", { vehicles: [], routes: [] })).toContain("Add a vehicle and route before scheduling a departure.");
});

test("delivery assignment and completion retain distinct forms and required evidence", () => {
  const assigned = renderBusinessTools("deliveries", { records: [{ ...record, status: "assigned" }] });
  expect(assigned).toContain('name="intent" value="assign"');
  expect(assigned).toContain('value="collected"');
  expect(assigned).not.toContain('name="proof"');
  const collected = renderBusinessTools("deliveries", { records: [{ ...record, status: "collected" }] });
  expect(collected).not.toContain('name="intent" value="assign"');
  expect(collected).toContain('value="delivered"');
  expect(collected).toContain('name="proof"');
});

test("reservation requests retain confirmation choices and terminal rentals have no status form", () => {
  const requested = renderBusinessTools("reservations", { records: [{ ...record, status: "requested" }] });
  expect(requested).toContain('value="confirmed"');
  expect(requested).toContain('value="rejected"');
  const returned = renderBusinessTools("reservations", { records: [{ ...record, status: "returned" }] });
  expect(returned).not.toContain('name="intent" value="status"');
});

test("record pagination and overview retain their existing navigation and money formatting", () => {
  const paged = renderBusinessTools("products", { page: 2, total: 60 });
  expect(paged).toContain(`/tools?tool=products&amp;page=1"`);
  expect(paged).toContain(`/tools?tool=products&amp;page=3"`);
  const overview = renderBusinessTools("products", { overview: true, statistics: [{ tool: "orders", count: 12345, detail: "Order total", format: "money" }] });
  expect(overview).toContain("Order total");
  expect(overview).toMatch(/<strong>R\s*123[,.]45<\/strong>/);
  expect(overview).not.toContain('name="intent" value="create"');
});
