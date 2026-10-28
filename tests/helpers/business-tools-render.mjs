import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../../build/server/index.js";

export const toolNames = ["products", "livestock", "orders", "enquiries", "trailers", "reservations", "vehicles", "routes", "departures", "bookings", "drivers", "deliveryVehicles", "deliveryPersonnel", "deliveries", "transportRequests", "deliveryRequests"];

export function renderBusinessTools(tool, overrides = {}) {
  const loaded = {
    overview: false, statistics: [], writable: true,
    business: { _id: "b".repeat(24), name: "Test provider" },
    businesses: [{ _id: "b".repeat(24), name: "Test provider" }],
    available: toolNames, tool, records: [], total: 0, page: 1, limit: 20,
    vehicles: [{ _id: "c".repeat(24), registration: "TEST GP" }],
    routes: [{ _id: "d".repeat(24), name: "Test route" }],
    drivers: [{ _id: "e".repeat(24), user: "Driver account" }],
    ...overrides,
  };
  const router = createMemoryRouter([{
    id: "root", path: "/business/:id/tools", loader: () => loaded,
    Component: routes["routes/business-tools"].module.default,
  }], {
    initialEntries: [`/business/${loaded.business._id}/tools?tool=${tool}`],
    hydrationData: { loaderData: { root: loaded } },
  });
  try {
    return renderToStaticMarkup(createElement(RouterProvider, { router }));
  } finally {
    router.dispose();
  }
}

