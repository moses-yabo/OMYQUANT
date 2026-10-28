import { afterEach, expect, jest, test } from "@jest/globals";
import mongoose from "mongoose";
import * as db from "../app/.server/database/models.ts";
import { manage } from "../app/.server/shared/access.ts";
import {
  businessTool,
  toolMutation,
  toolsPage,
  businessStatistics,
} from "../app/.server/modules/business-tools.ts";
import { placeOrder } from "../app/.server/modules/inventory.ts";
import { handleApi } from "../app/.server/api.ts";
import { sessionCookie } from "../app/.server/modules/auth/auth.ts";

afterEach(() => jest.restoreAllMocks());
const actor = { id: "a".repeat(24), admin: false };
const business = "b".repeat(24);
test("taxi overview statistics count only the selected business and use current booking/trip states", async () => {
  const vehicles = jest
    .spyOn(db.Vehicle, "countDocuments")
    .mockResolvedValue(4);
  const drivers = jest.spyOn(db.Driver, "countDocuments").mockResolvedValue(3);
  const bookings = jest
    .spyOn(db.Booking, "countDocuments")
    .mockResolvedValue(7);
  const departures = jest
    .spyOn(db.Departure, "countDocuments")
    .mockResolvedValue(2);
  const fares = jest
    .spyOn(db.Booking, "aggregate")
    .mockResolvedValueOnce([{ value: 90000 }])
    .mockResolvedValueOnce([{ value: 45000 }]);
  const statistics = await businessStatistics(business, [
    "vehicles",
    "drivers",
    "bookings",
    "departures",
  ]);
  expect(statistics.slice(0, 4).map((item) => item.count)).toEqual([
    4, 3, 7, 2,
  ]);
  expect(statistics).toContainEqual(
    expect.objectContaining({ label: "Trips completed", count: 2 }),
  );
  expect(statistics).toContainEqual(
    expect.objectContaining({
      label: "Completed trip booking value",
      count: 90000,
      format: "money",
    }),
  );
  expect(statistics).toContainEqual(
    expect.objectContaining({ label: "Cancelled booking value", count: 45000 }),
  );
  expect(fares.mock.calls[0][0][0]).toEqual({
    $match: {
      business: new mongoose.Types.ObjectId(business),
      status: "confirmed",
    },
  });
  expect(fares.mock.calls[0][0]).toContainEqual({
    $match: {
      "trip.business": new mongoose.Types.ObjectId(business),
      "trip.status": "completed",
    },
  });
  expect(vehicles).toHaveBeenCalledWith({ business });
  expect(drivers).toHaveBeenCalledWith({ business });
  expect(bookings).toHaveBeenCalledWith({ business, status: "confirmed" });
  expect(departures).toHaveBeenCalledWith({
    business,
    status: "scheduled",
    startsAt: { $gt: expect.any(Date) },
  });
});

test("farm performance separates fulfilled, delivered and cancelled values and scopes every aggregate to the business", async () => {
  jest.spyOn(db.Order, "countDocuments").mockResolvedValue(3);
  const aggregate = jest
    .spyOn(db.Order, "aggregate")
    .mockResolvedValueOnce([{ value: 12 }])
    .mockResolvedValueOnce([{ value: 8 }])
    .mockResolvedValueOnce([{ value: 50000 }])
    .mockResolvedValueOnce([{ value: 10000 }]);
  const statistics = await businessStatistics(business, ["orders"]);
  expect(statistics).toContainEqual(
    expect.objectContaining({ label: "Product units fulfilled", count: 12 }),
  );
  expect(statistics).toContainEqual(
    expect.objectContaining({ label: "Product units delivered", count: 8 }),
  );
  expect(statistics).toContainEqual(
    expect.objectContaining({
      label: "Fulfilled order value",
      count: 50000,
      format: "money",
    }),
  );
  expect(statistics).toContainEqual(
    expect.objectContaining({ label: "Cancelled order value", count: 10000 }),
  );
  for (const [pipeline] of aggregate.mock.calls)
    expect(pipeline[0].$match.business).toEqual(
      new mongoose.Types.ObjectId(business),
    );
  expect(aggregate.mock.calls[1][0]).toContainEqual({
    $match: {
      "delivery.status": "delivered",
      $expr: { $eq: ["$delivery.order", "$_id"] },
    },
  });
});

test("rental and delivery performance distinguishes completed value and business-reported payments", async () => {
  jest.spyOn(db.Reservation, "countDocuments").mockResolvedValue(2);
  jest.spyOn(db.Delivery, "countDocuments").mockResolvedValue(4);
  const rentals = jest
    .spyOn(db.Reservation, "aggregate")
    .mockResolvedValueOnce([{ value: 60000 }])
    .mockResolvedValueOnce([{ value: 20000 }])
    .mockResolvedValueOnce([]);
  const quotes = jest
    .spyOn(db.Quote, "aggregate")
    .mockResolvedValue([{ value: 80000 }]);
  const statistics = await businessStatistics(business, [
    "reservations",
    "deliveries",
  ]);
  expect(statistics).toContainEqual(
    expect.objectContaining({ label: "Rentals completed", count: 2 }),
  );
  expect(statistics).toContainEqual(
    expect.objectContaining({
      label: "Rental payments reported",
      count: 20000,
    }),
  );
  expect(statistics).toContainEqual(
    expect.objectContaining({ label: "Cancelled rental value", count: 0 }),
  );
  expect(statistics).toContainEqual(
    expect.objectContaining({
      label: "Completed delivery quote value",
      count: 80000,
    }),
  );
  expect(
    rentals.mock.calls[1][0][0].$match["externalPayment.verification"],
  ).toBe("business_reported");
  expect(quotes.mock.calls[0][0]).toContainEqual({
    $match: {
      "delivery.business": new mongoose.Types.ObjectId(business),
      "delivery.status": "delivered",
    },
  });
  expect(statistics.some((item) => /profit|loss/i.test(item.label ?? ""))).toBe(
    false,
  );
});
function company({ verified = true, types = ["farm"], member = true } = {}) {
  jest
    .spyOn(db.Business, "findOne")
    .mockResolvedValue({ _id: business, active: true, verified, types });
  jest
    .spyOn(db.Membership, "exists")
    .mockResolvedValue(member ? { _id: "membership" } : null);
  jest
    .spyOn(db.Membership, "findOne")
    .mockResolvedValue(member ? { role: "owner", permissions: [] } : null);
  jest.spyOn(db.Membership, "distinct").mockResolvedValue([business]);
  jest
    .spyOn(db.Business, "find")
    .mockReturnValue({
      select: () => ({
        lean: async () => [{ _id: business, name: "Test business" }],
      }),
    });
}
test("pending owners can inspect their business but cannot use operational tools", async () => {
  company({ verified: false });
  await expect(manage(actor, business)).resolves.toMatchObject({
    verified: false,
  });
  await expect(businessTool(actor, business, "products")).rejects.toMatchObject(
    { status: 403 },
  );
  await expect(
    toolsPage(actor, business, new URL("https://example.test/business")),
  ).rejects.toMatchObject({ status: 403 });
});
test("verification does not grant access to another business or a different service", async () => {
  company({ types: ["trailer_rental"] });
  await expect(
    businessTool(actor, business, "trailers"),
  ).resolves.toMatchObject({ verified: true });
  await expect(
    businessTool(actor, business, "livestock"),
  ).rejects.toMatchObject({ status: 403 });
  await expect(businessTool(actor, business, "bookings")).rejects.toMatchObject(
    { status: 403 },
  );
  db.Membership.exists.mockResolvedValue(null);
  await expect(
    businessTool(actor, business, "reservations"),
  ).rejects.toMatchObject({ status: 403 });
});
test("platform administrators cannot use a pending business service", async () => {
  company({ verified: false });
  await expect(
    businessTool({ ...actor, admin: true }, business, "products"),
  ).rejects.toMatchObject({ status: 403 });
});
test("verified business operations are scoped to both business and record", async () => {
  company();
  const read = jest.spyOn(db.Order, "findOne").mockResolvedValue(null);
  await expect(
    toolMutation(actor, business, "orders", "c".repeat(24)),
  ).rejects.toMatchObject({ status: 404 });
  expect(read).toHaveBeenCalledWith({ _id: "c".repeat(24), business });
});
test("multi-service businesses receive only their enabled tool groups", async () => {
  company({ types: ["farm", "trailer_rental"] });
  jest.spyOn(db.Product, "find").mockReturnValue({
    select() {
      return this;
    },
    sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => [] }) }) }),
  });
  jest.spyOn(db.Product, "countDocuments").mockResolvedValue(0);
  const loaded = await toolsPage(
    actor,
    business,
    new URL("https://example.test/business?tool=products"),
  );
  expect(loaded.available).toEqual([
    "products",
    "livestock",
    "orders",
    "enquiries",
    "trailers",
    "reservations",
  ]);
  await expect(
    toolsPage(
      actor,
      business,
      new URL("https://example.test/business?tool=vehicles"),
    ),
  ).rejects.toMatchObject({ status: 403 });
});
test.each(["product", "livestock"])(
  "orders reject an unverified %s seller within the stock transaction",
  async (kind) => {
    const session = {};
    jest
      .spyOn(mongoose.connection, "transaction")
      .mockImplementation((work) => work(session));
    jest
      .spyOn(kind === "product" ? db.Product : db.Livestock, "findOneAndUpdate")
      .mockResolvedValue({ business, name: "Listing", price: 100 });
    const exists = jest
      .spyOn(db.Business, "exists")
      .mockReturnValue({ session: async () => null });
    const create = jest.spyOn(db.Order, "create");
    await expect(
      placeOrder(actor, {
        items: [{ listing: "c".repeat(24), kind, quantity: 1 }],
        fulfilment: "collection",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(exists).toHaveBeenCalledWith({
      _id: business,
      active: true,
      verified: true,
      $or: [
        { verificationStatus: "APPROVED" },
        { verificationStatus: { $exists: false } },
      ],
      types: "farm",
    });
    expect(create).not.toHaveBeenCalled();
  },
);
test("direct API requests cannot create listings for an unverified business", async () => {
  const original = process.env.MONGODB_URI;
  process.env.MONGODB_URI = "mongodb://unused-test";
  try {
    jest.spyOn(mongoose, "connect").mockResolvedValue(mongoose);
    company({ verified: false, types: ["trailer_rental"] });
    jest.spyOn(db.Session, "findOne").mockResolvedValue({ user: actor.id });
    jest
      .spyOn(db.User, "findOne")
      .mockResolvedValue({ _id: actor.id, active: true, admin: false });
    const create = jest.spyOn(db.Trailer, "create");
    const path = "rentals/trailers";
    const response = await handleApi(
      new Request(`https://example.test/api/v1/${path}`, {
        method: "POST",
        headers: {
          Cookie: await sessionCookie.serialize("1".repeat(64)),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          business,
          name: "Trailer",
          trailerType: "Utility",
          dimensions: { length: 2, width: 1, height: 1 },
          payloadKg: 500,
          dailyPrice: 20000,
          location: { address: "Test", province: "Gauteng" },
          images: [],
          documents: [],
        }),
      }),
      path,
    );
    expect(response.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  } finally {
    if (original === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = original;
  }
});

test("direct trailer requests reject unverified providers without creating a reservation", async () => {
  const original = process.env.MONGODB_URI;
  process.env.MONGODB_URI = "mongodb://unused-test";
  try {
    jest.spyOn(mongoose, "connect").mockResolvedValue(mongoose);
    jest.spyOn(db.Session, "findOne").mockResolvedValue({ user: actor.id });
    jest
      .spyOn(db.User, "findOne")
      .mockResolvedValue({ _id: actor.id, active: true, admin: false });
    jest
      .spyOn(db.Trailer, "findOne")
      .mockResolvedValue({ business, dailyPrice: 10000 });
    const eligible = jest.spyOn(db.Business, "exists").mockResolvedValue(null);
    const create = jest.spyOn(db.Reservation, "create");
    const path = "rentals/reservations";
    const response = await handleApi(
      new Request(`https://example.test/api/v1/${path}`, {
        method: "POST",
        headers: {
          Cookie: await sessionCookie.serialize("1".repeat(64)),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trailer: "c".repeat(24),
          start: new Date(Date.now() + 86400000).toISOString(),
          end: new Date(Date.now() + 172800000).toISOString(),
        }),
      }),
      path,
    );
    expect(response.status).toBe(409);
    expect(eligible).toHaveBeenCalledWith({
      _id: business,
      active: true,
      verified: true,
      $or: [
        { verificationStatus: "APPROVED" },
        { verificationStatus: { $exists: false } },
      ],
      types: "trailer_rental",
    });
    expect(create).not.toHaveBeenCalled();
  } finally {
    if (original === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = original;
  }
});

test.each([
  "farming/products",
  "farming/livestock",
  "rentals/trailers",
  "transport/departures",
])("public %s discovery uses verified matching providers", async (path) => {
  const original = process.env.MONGODB_URI;
  process.env.MONGODB_URI = "mongodb://unused-test";
  try {
    jest.spyOn(mongoose, "connect").mockResolvedValue(mongoose);
    const filter = jest.spyOn(db.Business, "distinct").mockResolvedValue([]);
    const chain = {
      populate() {
        return this;
      },
      sort() {
        return this;
      },
      skip() {
        return this;
      },
      limit() {
        return this;
      },
      lean: async () => [],
    };
    const model =
      path === "farming/products"
        ? db.Product
        : path === "farming/livestock"
          ? db.Livestock
          : path === "rentals/trailers"
            ? db.Trailer
            : db.Departure;
    jest.spyOn(model, "find").mockReturnValue(chain);
    const response = await handleApi(
      new Request(`https://example.test/api/v1/${path}`),
      path,
    );
    expect(response.status).toBe(200);
    expect(filter).toHaveBeenCalledWith("_id", {
      active: true,
      verified: true,
      $or: [
        { verificationStatus: "APPROVED" },
        { verificationStatus: { $exists: false } },
      ],
      types: path.startsWith("farming")
        ? "farm"
        : path.startsWith("rentals")
          ? "trailer_rental"
          : "taxi_operator",
    });
  } finally {
    if (original === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = original;
  }
});

test("changing business services atomically resets verification", async () => {
  const original = process.env.MONGODB_URI;
  process.env.MONGODB_URI = "mongodb://unused-test";
  try {
    jest.spyOn(mongoose, "connect").mockResolvedValue(mongoose);
    company();
    jest.spyOn(db.Session, "findOne").mockResolvedValue({ user: actor.id });
    jest
      .spyOn(db.User, "findOne")
      .mockResolvedValue({ _id: actor.id, active: true, admin: false });
    const update = jest
      .spyOn(db.Business, "findByIdAndUpdate")
      .mockResolvedValue({ _id: business, verified: false });
    const path = `businesses/${business}`;
    const response = await handleApi(
      new Request(`https://example.test/api/v1/${path}`, {
        method: "PATCH",
        headers: {
          Cookie: await sessionCookie.serialize("1".repeat(64)),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ types: ["farm", "trailer_rental"] }),
      }),
      path,
    );
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      business,
      {
        $set: {
          types: ["farm", "trailer_rental"],
          verified: false,
          verificationStatus: "PENDING",
        },
      },
      { new: true, runValidators: true },
    );
  } finally {
    if (original === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = original;
  }
});

test.each([true, false])(
  "taxi scheduling serializes its vehicle and rejects an existing departure: %s",
  async (duplicate) => {
    const original = process.env.MONGODB_URI;
    process.env.MONGODB_URI = "mongodb://unused-test";
    try {
      jest.spyOn(mongoose, "connect").mockResolvedValue(mongoose);
      company({ types: ["taxi_operator"] });
      jest.spyOn(db.Session, "findOne").mockResolvedValue({ user: actor.id });
      jest
        .spyOn(db.User, "findOne")
        .mockResolvedValue({ _id: actor.id, active: true, admin: false });
      const session = {};
      jest
        .spyOn(mongoose.connection, "transaction")
        .mockImplementation((work) => work(session));
      const vehicle = jest
        .spyOn(db.Vehicle, "findOneAndUpdate")
        .mockResolvedValue({ capacity: 20 });
      jest
        .spyOn(db.Route, "exists")
        .mockReturnValue({ session: async () => ({ _id: "e".repeat(24) }) });
      jest
        .spyOn(db.Departure, "exists")
        .mockReturnValue({
          session: async () => (duplicate ? { _id: "f".repeat(24) } : null),
        });
      const create = jest
        .spyOn(db.Departure, "create")
        .mockResolvedValue([{ _id: "f".repeat(24) }]);
      const path = "transport/departures";
      const response = await handleApi(
        new Request(`https://example.test/api/v1/${path}`, {
          method: "POST",
          headers: {
            Cookie: await sessionCookie.serialize("1".repeat(64)),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            business,
            vehicle: "c".repeat(24),
            route: "e".repeat(24),
            startsAt: new Date(Date.now() + 86400000).toISOString(),
            price: 45000,
          }),
        }),
        path,
      );
      expect(vehicle).toHaveBeenCalledWith(
        { _id: "c".repeat(24), business },
        { $inc: { scheduleVersion: 1 } },
        { new: true, session },
      );
      expect(response.status).toBe(duplicate ? 409 : 201);
      if (duplicate) expect(create).not.toHaveBeenCalled();
      else
        expect(create).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              capacity: 15,
              remaining: 15,
              vehicle: "c".repeat(24),
            }),
          ],
          { session },
        );
    } finally {
      if (original === undefined) delete process.env.MONGODB_URI;
      else process.env.MONGODB_URI = original;
    }
  },
);
