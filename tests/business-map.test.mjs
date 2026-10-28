import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import mongoose from "mongoose";
import * as db from "../app/.server/database/models.ts";
import {
  businessPins,
  coordinateInput,
  filterMapBusinesses,
  mapStatus,
} from "../app/lib/business-map.ts";
import {
  businessMapData,
  setBusinessPin,
  geocodeBusinessLocation,
  confirmBusinessAddress,
} from "../app/.server/modules/business-map.ts";
import {
  autoGeocodeLocation,
  geocodeAddress,
  clearGeocodingCache,
} from "../app/.server/modules/geocoding.ts";
const actor = { id: "a".repeat(24), admin: true };
const business = "b".repeat(24);
const key = process.env.GEOAPIFY_API_KEY;
const point = {
  lat: -25.7,
  lon: 28.2,
  formatted: "10 Test Street, Pretoria, South Africa",
  place_id: "match-1",
  result_type: "building",
  country_code: "za",
  rank: { confidence: 1 },
};
const record = {
  _id: business,
  name: "Taxi operator",
  types: ["taxi_operator"],
  active: true,
  verified: true,
  locations: [
    {
      address: "10 Test Street, Pretoria",
      province: "Gauteng",
      latitude: -25.7,
      longitude: 28.2,
    },
  ],
};
beforeEach(() => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  process.env.GEOAPIFY_API_KEY = "private-test-key";
  clearGeocodingCache();
  jest
    .spyOn(db.LoginAttempt, "findOneAndUpdate")
    .mockResolvedValue({ count: 1 });
});
afterEach(() => {
  jest.restoreAllMocks();
  clearGeocodingCache();
  if (key === undefined) delete process.env.GEOAPIFY_API_KEY;
  else process.env.GEOAPIFY_API_KEY = key;
});
const provider = (results) =>
  jest.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ results }));

test("pins require a valid coordinate pair, preserve zero and do not invent a position for an address", () => {
  const records = [
    record,
    {
      ...record,
      _id: "c".repeat(24),
      locations: [
        { address: "Pretoria", province: "Gauteng" },
        { latitude: 0, longitude: 0 },
        { latitude: NaN, longitude: 28 },
      ],
    },
  ];
  const pins = businessPins(records);
  expect(pins).toHaveLength(2);
  expect(pins[1]).toMatchObject({ latitude: 0, longitude: 0 });
  expect(coordinateInput("", "")).toEqual({});
  expect(() => coordinateInput("-25", "")).toThrow();
  expect(() => coordinateInput("91", "28")).toThrow();
});
test("business filters combine name/address, service, province and independent verification/active state", () => {
  const other = {
    ...record,
    _id: "c".repeat(24),
    name: "Farm",
    types: ["farm"],
    verified: false,
    active: false,
  };
  expect(
    filterMapBusinesses([record, other], {
      query: "Pretoria",
      status: "APPROVED",
      type: "taxi_operator",
      province: "Gauteng",
    }),
  ).toEqual([record]);
  expect(mapStatus(other)).toBe("INACTIVE");
});
test("only platform administrators can read business map data or change pins", async () => {
  const read = jest.spyOn(db.Business, "find");
  await expect(
    businessMapData({ ...actor, admin: false }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    setBusinessPin({ ...actor, admin: false }, business, {
      index: 0,
      latitude: 1,
      longitude: 2,
    }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    geocodeBusinessLocation({ ...actor, admin: false }, business, { index: 0 }),
  ).rejects.toMatchObject({ status: 403 });
  expect(read).not.toHaveBeenCalled();
});
test("map data projects only business location fields and bounds the dataset", async () => {
  const query = {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: async () => [record],
  };
  jest.spyOn(db.Business, "find").mockReturnValue(query);
  jest.spyOn(db.Business, "countDocuments").mockResolvedValue(1001);
  const data = await businessMapData(actor);
  expect(query.select).toHaveBeenCalledWith(
    "_id name types active verified verificationStatus locations",
  );
  expect(query.limit).toHaveBeenCalledWith(1000);
  expect(data.total).toBe(1001);
});
test("pin edits and reviewer audit commit in one transaction without approving the business", async () => {
  const session = {};
  const company = {
    verified: false,
    locations: [{ address: "Test", latitude: 1, longitude: 2 }],
    save: jest.fn(),
  };
  jest
    .spyOn(db.BusinessLocationReview, "init")
    .mockResolvedValue(db.BusinessLocationReview);
  jest
    .spyOn(mongoose.connection, "transaction")
    .mockImplementation((work) => work(session));
  jest
    .spyOn(db.Business, "findById")
    .mockReturnValue({ session: async () => company });
  const audit = jest
    .spyOn(db.BusinessLocationReview, "create")
    .mockResolvedValue([{}]);
  await setBusinessPin(actor, business, {
    index: 0,
    latitude: -25.7,
    longitude: 28.2,
  });
  expect(company.save).toHaveBeenCalledWith({ session });
  expect(company.verified).toBe(false);
  expect(audit).toHaveBeenCalledWith(
    [
      expect.objectContaining({
        business,
        reviewer: actor.id,
        locationIndex: 0,
        previous: { latitude: 1, longitude: 2 },
        coordinates: { latitude: -25.7, longitude: 28.2 },
      }),
    ],
    { session },
  );
});
test("Geoapify receives a South Africa address query and cached results do not expose the server key", async () => {
  const fetch = provider([point]);
  const first = await geocodeAddress(
    "10 Test Street, Pretoria",
    "Gauteng",
    actor.id,
  );
  await geocodeAddress("10 Test Street, Pretoria", "Gauteng", actor.id);
  expect(fetch).toHaveBeenCalledTimes(1);
  const url = new URL(fetch.mock.calls[0][0]);
  expect(url.hostname).toBe("api.geoapify.com");
  expect(url.searchParams.get("filter")).toBe("countrycode:za");
  expect(url.searchParams.get("text")).toContain(
    "Pretoria, Gauteng, South Africa",
  );
  expect(first[0]).toMatchObject({
    latitude: -25.7,
    longitude: 28.2,
    precision: "building",
  });
  expect(JSON.stringify(first)).not.toContain("private-test-key");
});
test("only an unambiguous high-confidence premises match is automatically pinned", async () => {
  provider([point]);
  const location = { address: "Test", province: "Gauteng" };
  await expect(autoGeocodeLocation(location, actor.id)).resolves.toMatchObject({
    latitude: -25.7,
    longitude: 28.2,
    geocoding: { reviewed: false },
  });
  clearGeocodingCache();
  globalThis.fetch.mockResolvedValue(
    Response.json({ results: [{ ...point, result_type: "city" }] }),
  );
  await expect(autoGeocodeLocation(location, actor.id)).resolves.toEqual(
    location,
  );
  clearGeocodingCache();
  globalThis.fetch.mockResolvedValue(
    Response.json({
      results: [point, { ...point, place_id: "match-2", lat: -26 }],
    }),
  );
  await expect(autoGeocodeLocation(location, actor.id)).resolves.toEqual(
    location,
  );
});
test("missing configuration and provider failures never leak secrets or prevent registration", async () => {
  delete process.env.GEOAPIFY_API_KEY;
  const fetch = provider([point]);
  const location = { address: "Test", province: "Gauteng" };
  await expect(autoGeocodeLocation(location, actor.id)).resolves.toEqual(
    location,
  );
  expect(fetch).not.toHaveBeenCalled();
  await expect(
    geocodeAddress("Test", "Gauteng", actor.id),
  ).rejects.toMatchObject({ status: 503 });
  process.env.GEOAPIFY_API_KEY = "private-test-key";
  fetch.mockRejectedValue(new Error("private-test-key at provider URL"));
  await expect(
    geocodeAddress("Test", "Gauteng", actor.id),
  ).rejects.toMatchObject({
    status: 503,
    message: "The server could not reach Geoapify. Please try again later.",
  });
  await expect(autoGeocodeLocation(location, actor.id)).resolves.toEqual(
    location,
  );
});
test("rate-limited lookups never contact the provider", async () => {
  db.LoginAttempt.findOneAndUpdate.mockResolvedValue({ count: 21 });
  const fetch = provider([point]);
  await expect(
    geocodeAddress("Test", "Gauteng", actor.id),
  ).rejects.toMatchObject({ status: 429 });
  expect(fetch).not.toHaveBeenCalled();
});

test.each([
  [401, "API key"],
  [403, "access restrictions"],
  [429, "request limit"],
  [500, "unable to process"],
])(
  "provider HTTP %s produces actionable errors without leaking response contents",
  async (status, message) => {
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response("private-test-key provider details", { status }),
      );
    await expect(
      geocodeAddress("Test", "Gauteng", actor.id),
    ).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining(message),
    });
    expect(console.warn).toHaveBeenCalledWith("Geocoding lookup failed", {
      provider: "geoapify",
      reason: "http",
      status,
    });
    expect(JSON.stringify(console.warn.mock.calls)).not.toContain(
      "private-test-key",
    );
  },
);

test("timeouts and invalid provider responses have distinct safe diagnostics", async () => {
  const fetch = jest
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new DOMException("private-test-key", "TimeoutError"));
  await expect(geocodeAddress("Test", "Gauteng", actor.id)).rejects.toThrow(
    "timed out",
  );
  fetch.mockResolvedValue(
    Response.json({ results: [{ unexpected: "private-test-key" }] }),
  );
  await expect(geocodeAddress("Test", "Gauteng", actor.id)).rejects.toThrow(
    "unexpected response",
  );
  expect(JSON.stringify(console.warn.mock.calls)).not.toContain(
    "private-test-key",
  );
});
test("confirmed address matches are persisted with provenance and a transactional reviewer audit", async () => {
  provider([point]);
  const company = {
    locations: [{ address: "Test", province: "Gauteng" }],
    save: jest.fn(),
  };
  const session = {};
  jest.spyOn(db.Business, "findById").mockReturnValue({
    lean: async () => company,
    session: async () => company,
  });
  jest
    .spyOn(db.BusinessLocationReview, "init")
    .mockResolvedValue(db.BusinessLocationReview);
  const audit = jest
    .spyOn(db.BusinessLocationReview, "create")
    .mockResolvedValue([{}]);
  jest
    .spyOn(mongoose.connection, "transaction")
    .mockImplementation((work) => work(session));
  await confirmBusinessAddress(actor, business, {
    index: 0,
    candidate: "match-1",
    address: "Test",
    province: "Gauteng",
  });
  expect(company.locations[0]).toMatchObject({
    latitude: -25.7,
    longitude: 28.2,
    geocoding: { provider: "geoapify", reviewed: true },
  });
  expect(audit).toHaveBeenCalledWith(
    [expect.objectContaining({ reviewer: actor.id })],
    { session },
  );
  await expect(
    confirmBusinessAddress(actor, business, {
      index: 0,
      candidate: "match-1",
      address: "Old address",
      province: "Gauteng",
    }),
  ).rejects.toMatchObject({ status: 409 });
});
