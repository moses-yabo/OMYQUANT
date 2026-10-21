import mongoose from "mongoose";
import { z } from "zod";
import { connectToDatabase } from "./database/connect";
import { ImageError, validateListingImages } from './database/images';
import { businessQueue, businessReview, verifyBusiness, findAdminAccount, setAdminAccess } from './modules/admin';
import * as db from "./database/models";
import {
  authenticate,
  digest,
  hashPassword,
  login,
  sessionCookie,
  sessionToken,
  verifyPassword,
} from "./modules/auth/auth";
import { resources, businessSchema, deliverySchema } from "./modules/resources";
import {
  placeOrder,
  bookSeats,
  cancelBooking,
  changeReservation,
} from "./modules/inventory";
import { manage, owns } from "./shared/access";
import { TAXI_PASSENGER_CAPACITY } from '../lib/taxi-capacity';
import {
  ApiError,
  id,
  location,
  money,
  page,
  quantity,
  text,
} from "./shared/http";

const credentials = z
  .object({
    email: z.email().toLowerCase(),
    password: z.string().min(12).max(128),
  })
  .strict();
const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const json = (
  data: unknown,
  status = 200,
  extra: Record<string, string> = {},
) => Response.json({ data }, { status, headers: { ...headers, ...extra } });
async function body(request: Request) {
  if (!request.headers.get("Content-Type")?.includes("application/json"))
    throw new ApiError(415, "Use application/json");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "JSON body required");
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 65536) {
      await reader.cancel();
      throw new ApiError(413, "Request too large");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new ApiError(400, "Invalid JSON");
  }
}
async function list(
  model: mongoose.Model<any>,
  filter: Record<string, unknown>,
  url: URL,
) {
  const { page: current, limit } = page.parse(
    Object.fromEntries(url.searchParams),
  );
  const query = url.searchParams.get("q")?.trim().slice(0, 100);
  if (query)
    filter.name = {
      $regex: query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      $options: "i",
    };
  if (url.searchParams.get("province"))
    filter["location.province"] = url.searchParams.get("province");
  const priceField = model.modelName === "Trailer" ? "dailyPrice" : "price";
  const data = await model
    .find(filter)
    .sort(
      url.searchParams.get("sort") === "low"
        ? { [priceField]: 1, _id: -1 }
        : url.searchParams.get("sort") === "high"
          ? { [priceField]: -1, _id: -1 }
          : { _id: -1 },
    )
    .skip((current - 1) * limit)
    .limit(limit)
    .lean();
  return Response.json(
    { data, pagination: { page: current, limit } },
    { headers },
  );
}
export async function handleApi(request: Request, path: string) {
  try {
    const method = request.method;
    const url = new URL(request.url);
    if (method !== "GET" && method !== "HEAD") {
      const expected = process.env.APP_ORIGIN ?? url.origin;
      if (
        request.headers.get("Origin") &&
        request.headers.get("Origin") !== expected
      )
        throw new ApiError(403, "Cross-origin mutation denied");
      if (request.headers.get("Sec-Fetch-Site") === "cross-site")
        throw new ApiError(403, "Cross-site mutation denied");
    }
    if (path === "health" && method === "GET")
      return json({ service: "OMYQUANT", framework: "React Router" });
    if (
      !process.env.MONGODB_URI &&
      ["auth/register", "auth/login", "auth/logout", "users/me"].includes(path)
    )
      throw new ApiError(
        503,
        "Use browser demo authentication while MongoDB is disconnected.",
      );
    await connectToDatabase();
    if (path === "auth/register" && method === "POST") {
      const input = credentials
        .extend({ name: text })
        .parse(await body(request));
      const user = await db.User.create({
        name: input.name,
        email: input.email,
        passwordHash: await hashPassword(input.password),
      });
      return json({ id: user._id, name: user.name, email: user.email }, 201);
    }
    if (path === "auth/login" && method === "POST") {
      const input = credentials.parse(await body(request));
      // Database-backed account throttling works across app instances; no proxy/IP trust needed.
      const bucket = `${digest(input.email)}:${Math.floor(Date.now() / 900000)}`;
      const attempt = await db.LoginAttempt.findOneAndUpdate(
        { key: bucket },
        {
          $inc: { count: 1 },
          $setOnInsert: { expiresAt: new Date(Date.now() + 1800000) },
        },
        { upsert: true, new: true },
      );
      if (Number(attempt.count) > 10)
        throw new ApiError(429, "Too many login attempts; try later");
      const user = await db.User.findOne({
        email: input.email,
        active: true,
      }).select("+passwordHash");
      const valid = await verifyPassword(
        input.password,
        String(
          user?.passwordHash ??
            "0123456789abcdef0123456789abcdef:" + "00".repeat(64),
        ),
      );
      if (!user || !valid) throw new ApiError(401, "Invalid credentials");
      return json({ id: user._id, expiresIn: 43200 }, 200, {
        "Set-Cookie": await login(user._id),
      });
    }
    if (method === "GET") {
      if (path === "transport/departures" && !url.searchParams.has('business')) {
        const { page: current, limit } = page.parse(
          Object.fromEntries(url.searchParams),
        );
        const data = await db.Departure.find({
          status: "scheduled",
          startsAt: { $gt: new Date() },
          remaining: { $gt: 0 },
          $expr: { $lt: [{ $subtract: ['$capacity', '$remaining'] }, { $min: ['$capacity', TAXI_PASSENGER_CAPACITY] }] },
          business: {
            $in: await db.Business.distinct("_id", { active: true, verified: true, types: 'taxi_operator' }),
          },
        })
          .populate({ path: "route", select: "name stops" })
          .sort({ startsAt: 1 })
          .skip((current - 1) * limit)
          .limit(limit)
          .lean();
        return Response.json(
          { data, pagination: { page: current, limit } },
          { headers },
        );
      }
      for (const [key, resource] of Object.entries(resources)) {
        if (
          !resource.public ||
          path !== key ||
          url.searchParams.has("business")
        )
          continue;
        const filter: Record<string, unknown> = {
          business: {
            $in: await db.Business.distinct("_id", { active: true, verified: true, types: resource.type }),
          },
        };
        if (key === "farming/products" || key === "farming/livestock")
          filter.status = "published";
        if (key === "rentals/trailers") filter.active = true;
        return list(resource.model, filter, url);
      }
    }
    const actor = await authenticate(request);
    if (path === 'admin/users' && method === 'GET') return json(await findAdminAccount(actor, url.searchParams.get('email') ?? ''));
    if (path === 'admin/businesses' && method === 'GET') return json(await businessQueue(actor, url));
    const adminBusiness = path.match(/^admin\/businesses\/([a-f0-9]{24})$/i);
    if (adminBusiness && method === 'GET') return json(await businessReview(actor, adminBusiness[1]));
    if (path === "farming/categories") {
      if (method === "GET") return list(db.Category, { active: true }, url);
      if (method === "POST") {
        if (!actor.admin)
          throw new ApiError(403, "Platform administrator required");
        return json(
          await db.Category.create(
            z
              .object({ name: text, description: text })
              .strict()
              .parse(await body(request)),
          ),
          201,
        );
      }
    }
    const businessMatch = path.match(/^businesses\/([a-f0-9]{24})$/i);
    if (businessMatch) {
      const company = await manage(
        actor,
        businessMatch[1],
        undefined,
        method !== "GET",
      );
      if (method === "GET") return json(company);
      if (method === "PATCH") {
        const input = businessSchema
          .partial()
          .extend({ active: z.boolean().optional() })
          .parse(await body(request));
        return json(
          await db.Business.findByIdAndUpdate(
            company._id,
            { $set: { ...input, ...(input.types ? { verified: false } : {}) } },
            { new: true, runValidators: true },
          ),
        );
      }
    }
    const dashboardMatch = path.match(
      /^farming\/farmers\/([a-f0-9]{24})\/dashboard$/i,
    );
    if (dashboardMatch && method === "GET") {
      await manage(actor, dashboardMatch[1], "farm");
      const business = new mongoose.Types.ObjectId(dashboardMatch[1]);
      const [products, livestock, orders, totals] = await Promise.all([
        db.Product.countDocuments({ business }),
        db.Livestock.countDocuments({ business }),
        db.Order.countDocuments({
          business,
          status: { $in: ["placed", "accepted"] },
        }),
        db.Order.aggregate([
          { $match: { business, status: "fulfilled" } },
          { $group: { _id: null, total: { $sum: "$total" } } },
        ]),
      ]);
      return json({
        products,
        livestock,
        openOrders: orders,
        fulfilledOrderValue: totals[0]?.total ?? 0,
        currency: "ZAR",
      });
    }
    const memberDelete = path.match(
      /^businesses\/([a-f0-9]{24})\/memberships\/([a-f0-9]{24})$/i,
    );
    if (memberDelete && method === "DELETE") {
      await manage(actor, memberDelete[1], undefined, true);
      const result = await db.Membership.deleteOne({
        business: memberDelete[1],
        user: memberDelete[2],
        role: { $ne: "owner" },
      });
      if (!result.deletedCount)
        throw new ApiError(404, "Non-owner membership not found");
      return json(null);
    }
    if (path === "auth/logout" && method === "POST") {
      await db.Session.deleteOne({
        digest: digest(await sessionToken(request)),
      });
      return json(null, 200, {
        "Set-Cookie": await sessionCookie.serialize("", { maxAge: 0 }),
      });
    }
    if (path === "users/me" && method === "GET")
      return json(await db.User.findById(actor.id));
    const adminMatch = path.match(/^users\/([a-f0-9]{24})\/permissions$/i);
    if (adminMatch && method === "PATCH") {
      return json(await setAdminAccess(actor, adminMatch[1], await body(request)));
    }
    if (path === "businesses") {
      if (method === "POST") {
        const input = businessSchema.parse(await body(request));
        const company = await mongoose.connection.transaction(
          async (session) => {
            const [company] = await db.Business.create([input], { session });
            await db.Membership.create(
              [
                {
                  business: String(company._id),
                  user: actor.id,
                  role: "owner",
                },
              ],
              { session },
            );
            return company;
          },
        );
        return json(company, 201);
      }
      if (method === "GET")
        return list(
          db.Business,
          {
            _id: {
              $in: await db.Membership.distinct("business", { user: actor.id }),
            },
          },
          url,
        );
    }
    const membershipMatch = path.match(
      /^businesses\/([a-f0-9]{24})\/memberships$/i,
    );
    if (membershipMatch) {
      await manage(actor, membershipMatch[1], undefined, true);
      if (method === "GET")
        return list(db.Membership, { business: membershipMatch[1] }, url);
      if (method === "POST") {
        const input = z
          .object({ user: id, role: z.enum(["manager", "staff"]) })
          .strict()
          .parse(await body(request));
        if (!(await db.User.exists({ _id: input.user, active: true })))
          throw new ApiError(400, "User not found");
        return json(
          await db.Membership.create({
            ...input,
            business: membershipMatch[1],
          }),
          201,
        );
      }
    }
    const verificationMatch = path.match(
      /^businesses\/([a-f0-9]{24})\/verification$/i,
    );
    if (verificationMatch && method === "PATCH") {
      return json(await verifyBusiness(actor, verificationMatch[1], await body(request)));
    }
    for (const [key, resource] of Object.entries(resources)) {
      if (path !== key && !path.startsWith(key + "/")) continue;
      const recordId =
        path === key ? undefined : id.parse(path.slice(key.length + 1));
      if (method === "GET") {
        const filter: Record<string, unknown> = recordId
          ? { _id: recordId }
          : {};
        const managedBusiness = url.searchParams.get("business");
        if (managedBusiness) {
          await manage(actor, id.parse(managedBusiness), resource.type);
          filter.business = managedBusiness;
        }
        if (!resource.public && !managedBusiness)
          filter.business = {
            $in: await db.Business.distinct('_id', { active: true, verified: true, types: resource.type, _id: { $in: await db.Membership.distinct('business', { user: actor.id }) } }),
          };
        if (resource.public && !managedBusiness) filter.business = { $in: await db.Business.distinct('_id', { active: true, verified: true, types: resource.type }) };
        if (
          !managedBusiness &&
          (key === "farming/products" || key === "farming/livestock")
        )
          filter.status = "published";
        if (key === "rentals/trailers" && !managedBusiness) filter.active = true;
        return list(resource.model, filter, url);
      }
      if (method === "POST" && !recordId) {
        const input = resource.schema.parse(await body(request));
        await manage(actor, input.business, resource.type);
        if ('images' in input) input.images = await validateListingImages(String(input.business), input.images);
        if (
          "user" in input &&
          !(await db.User.exists({ _id: input.user, active: true }))
        )
          throw new ApiError(400, "Driver user not found");
        if (
          "driver" in input &&
          input.driver &&
          !(await db.Driver.exists({
            _id: input.driver,
            business: input.business,
          }))
        )
          throw new ApiError(400, "Driver must belong to business");
        return json(await resource.model.create(input), 201);
      }
      if (method === "PATCH" && recordId) {
        const existing = await resource.model.findById(recordId);
        if (!existing) throw new ApiError(404, "Resource not found");
        await manage(actor, existing.business, resource.type);
        const raw = z
          .record(z.string(), z.unknown())
          .parse(await body(request));
        const parsed = resource.schema.partial().parse(raw);
        const input = Object.fromEntries(
          Object.entries(parsed).filter(([key]) => Object.hasOwn(raw, key)),
        );
        if ("business" in input)
          throw new ApiError(400, "Business cannot be changed");
        if ('images' in input) input.images = await validateListingImages(String(existing.business), input.images as string[]);
        if (
          "user" in input &&
          input.user &&
          !(await db.User.exists({ _id: input.user, active: true }))
        )
          throw new ApiError(400, "Driver user not found");
        if (
          "driver" in input &&
          input.driver &&
          !(await db.Driver.exists({
            _id: input.driver,
            business: existing.business,
          }))
        )
          throw new ApiError(400, "Driver must belong to business");
        return json(
          await resource.model.findByIdAndUpdate(
            recordId,
            { $set: input },
            { new: true, runValidators: true },
          ),
        );
      }
    }
    if (path === "transport/departures") {
      if (method === 'GET') {
        const business = id.parse(url.searchParams.get('business'));
        await manage(actor, business, 'taxi_operator');
        return list(db.Departure, { business }, url);
      }
      if (method === "POST") {
        const input = z
          .object({
            business: id,
            vehicle: id,
            route: id,
            startsAt: z.coerce.date().min(new Date()),
            price: money,
          })
          .strict()
          .parse(await body(request));
        await manage(actor, input.business, "taxi_operator");
        const departure = await mongoose.connection.transaction(async session => {
          // Serialize scheduling for this vehicle so one taxi cannot acquire
          // multiple seat pools at the same departure time.
          const vehicle = await db.Vehicle.findOneAndUpdate({ _id: input.vehicle, business: input.business }, { $inc: { scheduleVersion: 1 } }, { new: true, session });
          if (!vehicle || !await db.Route.exists({ _id: input.route, business: input.business }).session(session)) throw new ApiError(400, 'Vehicle and route must belong to business');
          if (await db.Departure.exists({ vehicle: input.vehicle, startsAt: input.startsAt, status: { $ne: 'cancelled' } }).session(session)) throw new ApiError(409, 'This taxi is already scheduled at that time. Select another vehicle.');
          const capacity = Math.min(Number(vehicle.capacity), TAXI_PASSENGER_CAPACITY);
          if (!Number.isInteger(capacity) || capacity < 1) throw new ApiError(400, 'Vehicle needs a valid passenger capacity');
          return (await db.Departure.create([{ ...input, capacity, remaining: capacity }], { session }))[0];
        });
        return json(departure, 201);
      }
    }
    if (path === "farming/orders" && method === "POST")
      return json(await placeOrder(actor, await body(request)), 201);
    if (path === "transport/bookings" && method === "POST")
      return json(await bookSeats(actor, await body(request)), 201);
    const bookingMatch = path.match(
      /^transport\/bookings\/([a-f0-9]{24})\/cancel$/i,
    );
    if (bookingMatch && method === "POST")
      return json(await cancelBooking(actor, bookingMatch[1]));
    if (path === "rentals/reservations" && method === "POST") {
      const input = z
        .object({
          trailer: id,
          start: z.coerce.date().min(new Date()),
          end: z.coerce.date(),
        })
        .strict()
        .refine((x) => x.end > x.start, "End must follow start")
        .parse(await body(request));
      const trailer = await db.Trailer.findOne({
        _id: input.trailer,
        active: true,
      });
      if (!trailer) throw new ApiError(404, "Trailer unavailable");
      if (!await db.Business.exists({ _id: trailer.business, active: true, verified: true, types: 'trailer_rental' })) throw new ApiError(409, 'Trailer provider is not verified or available');
      const total =
        Math.ceil((input.end.getTime() - input.start.getTime()) / 86400000) *
        Number(trailer.dailyPrice);
      if (!Number.isSafeInteger(total))
        throw new ApiError(400, "Rental total exceeds supported range");
      return json(
        await db.Reservation.create({
          ...input,
          customer: actor.id,
          business: String(trailer.business),
          total,
        }),
        201,
      );
    }
    const reservationMatch = path.match(
      /^rentals\/reservations\/([a-f0-9]{24})$/i,
    );
    if (reservationMatch && method === "PATCH")
      return json(
        await changeReservation(
          actor,
          reservationMatch[1],
          await body(request),
        ),
      );
    const paymentMatch = path.match(
      /^rentals\/reservations\/([a-f0-9]{24})\/external-payment$/i,
    );
    if (paymentMatch && method === "POST") {
      const input = z
        .object({ amount: money, reference: text })
        .strict()
        .parse(await body(request));
      const reservation = await db.Reservation.findById(paymentMatch[1]);
      if (!reservation) throw new ApiError(404, "Reservation not found");
      await manage(actor, reservation.business, "trailer_rental");
      reservation.set("externalPayment", {
        ...input,
        recordedBy: actor.id,
        recordedAt: new Date(),
        verification: "business_reported",
      });
      await reservation.save();
      return json(reservation);
    }
    if (path === "logistics/requests" && method === "POST") {
      const input = deliverySchema.parse(await body(request));
      return json(
        await mongoose.connection.transaction(async (session) => {
          const order =
            input.order &&
            (await db.Order.findById(input.order).session(session));
          if (input.order) {
            if (!order) throw new ApiError(404, "Order not found");
            owns(actor, order.customer);
            if (
              order.fulfilment !== "delivery" ||
              order.deliveryRequest ||
              order.status === "cancelled"
            )
              throw new ApiError(409, "Order is not eligible for delivery");
            if (
              (order.items as { kind: string }[]).some(
                (x) => x.kind === "livestock",
              ) &&
              input.goodsType !== "livestock"
            )
              throw new ApiError(
                400,
                "Livestock requires specialist transportation",
              );
          }
          const [delivery] = await db.Delivery.create(
            [{ ...input, customer: actor.id }],
            { session },
          );
          if (order) {
            order.deliveryRequest = delivery._id;
            await order.save({ session });
          }
          return delivery;
        }),
        201,
      );
    }
    const quoteMatch = path.match(
      /^logistics\/requests\/([a-f0-9]{24})\/quotes$/i,
    );
    if (quoteMatch) {
      const delivery = await db.Delivery.findById(quoteMatch[1]);
      if (!delivery) throw new ApiError(404, "Delivery not found");
      if (method === "GET") {
        owns(actor, delivery.customer);
        return list(db.Quote, { request: delivery._id }, url);
      }
      if (method === "POST") {
        const input = z
          .object({
            business: id,
            price: money,
            capabilities: z
              .array(z.enum(["parcel", "agricultural", "livestock"]))
              .min(1),
          })
          .strict()
          .parse(await body(request));
        const company = await manage(actor, input.business, "logistics");
        if (!company.verified)
          throw new ApiError(403, "Verified logistics business required");
        if (
          delivery.status !== "requested" ||
          !input.capabilities.includes(
            delivery.goodsType as "parcel" | "agricultural" | "livestock",
          )
        )
          throw new ApiError(409, "Provider cannot quote for this request");
        return json(
          await db.Quote.create({ ...input, request: delivery._id }),
          201,
        );
      }
    }
    const acceptQuote = path.match(
      /^logistics\/quotes\/([a-f0-9]{24})\/accept$/i,
    );
    if (acceptQuote && method === "POST") {
      return json(
        await mongoose.connection.transaction(async (session) => {
          const quote = await db.Quote.findOne({
            _id: acceptQuote[1],
            status: "offered",
          }).session(session);
          if (!quote) throw new ApiError(404, "Quote unavailable");
          const delivery = await db.Delivery.findById(quote.request).session(
            session,
          );
          if (!delivery) throw new ApiError(404, "Delivery not found");
          owns(actor, delivery.customer);
          if (delivery.status !== "requested")
            throw new ApiError(409, "Delivery already assigned");
          if (
            !(await db.Business.exists({
              _id: quote.business,
              active: true,
              verified: true,
              types: "logistics",
            }).session(session))
          )
            throw new ApiError(409, "Provider no longer eligible");
          delivery.business = quote.business;
          delivery.status = "assigned";
          quote.status = "accepted";
          await delivery.save({ session });
          await quote.save({ session });
          return delivery;
        }),
      );
    }
    const deliveryStatus = path.match(
      /^logistics\/requests\/([a-f0-9]{24})\/status$/i,
    );
    if (deliveryStatus && method === "PATCH") {
      const input = z
        .object({
          status: z.enum(["collected", "delivered"]),
          proof: z.url().optional(),
        })
        .strict()
        .parse(await body(request));
      const delivery = await db.Delivery.findById(deliveryStatus[1]);
      if (!delivery) throw new ApiError(404, "Delivery not found");
      await manage(actor, delivery.business, "logistics");
      if (input.status === "delivered" && !input.proof)
        throw new ApiError(400, "Proof of delivery required");
      const result = await db.Delivery.findOneAndUpdate(
        {
          _id: delivery._id,
          status: input.status === "collected" ? "assigned" : "collected",
        },
        { $set: input },
        { new: true },
      );
      if (!result) throw new ApiError(409, "Invalid delivery transition");
      return json(result);
    }
    const orderStatus = path.match(
      /^farming\/orders\/([a-f0-9]{24})\/status$/i,
    );
    if (orderStatus && method === "PATCH") {
      const input = z
        .object({ status: z.enum(["accepted", "fulfilled", "cancelled"]) })
        .strict()
        .parse(await body(request));
      return json(
        await mongoose.connection.transaction(async (session) => {
          const order = await db.Order.findById(orderStatus[1]).session(
            session,
          );
          if (!order) throw new ApiError(404, "Order not found");
          if (
            input.status === "cancelled" &&
            String(order.customer) === actor.id
          )
            owns(actor, order.customer);
          else await manage(actor, order.business, "farm");
          const allowed: Record<string, string[]> = {
            placed: ["accepted", "cancelled"],
            accepted: ["fulfilled", "cancelled"],
          };
          if (!allowed[String(order.status)]?.includes(input.status))
            throw new ApiError(409, "Invalid order transition");
          if (input.status === "cancelled") {
            if (order.deliveryRequest)
              throw new ApiError(
                409,
                "Linked delivery must be resolved before cancellation",
              );
            for (const item of order.items as {
              listing: unknown;
              kind: string;
              quantity: number;
            }[]) {
              await (
                item.kind === "product" ? db.Product : db.Livestock
              ).updateOne(
                { _id: item.listing },
                { $inc: { quantity: item.quantity } },
                { session },
              );
            }
          }
          order.status = input.status;
          await order.save({ session });
          return order;
        }),
      );
    }
    const tripStatus = path.match(
      /^transport\/departures\/([a-f0-9]{24})\/status$/i,
    );
    if (tripStatus && method === "PATCH") {
      const input = z
        .object({ status: z.enum(["departed", "completed", "cancelled"]) })
        .strict()
        .parse(await body(request));
      const departure = await db.Departure.findById(tripStatus[1]);
      if (!departure) throw new ApiError(404, "Departure not found");
      await manage(actor, departure.business, "taxi_operator");
      const allowed: Record<string, string[]> = {
        scheduled: ["departed", "cancelled"],
        departed: ["completed"],
      };
      if (!allowed[String(departure.status)]?.includes(input.status))
        throw new ApiError(409, "Invalid trip transition");
      const result = await db.Departure.findOneAndUpdate(
        { _id: departure._id, status: departure.status },
        { $set: input },
        { new: true },
      );
      if (!result) throw new ApiError(409, "Trip changed; retry");
      return json(result);
    }
    if (path === "business-transport/requests" && method === "POST") {
      const input = z
        .object({
          kind: z.enum(["staff", "charter", "private_minibus"]),
          passengers: quantity,
          pickup: location,
          dropoff: location,
          startsAt: z.coerce.date().min(new Date()),
        })
        .strict()
        .parse(await body(request));
      return json(
        await db.TransportRequest.create({ ...input, customer: actor.id }),
        201,
      );
    }
    const charterQuote = path.match(
      /^business-transport\/requests\/([a-f0-9]{24})\/quotes$/i,
    );
    if (charterQuote) {
      const trip = await db.TransportRequest.findById(charterQuote[1]);
      if (!trip) throw new ApiError(404, "Transport request not found");
      if (method === "GET") {
        owns(actor, trip.customer);
        return list(db.TransportQuote, { request: trip._id }, url);
      }
      if (method === "POST") {
        const input = z
          .object({ business: id, price: money, description: text })
          .strict()
          .parse(await body(request));
        await manage(actor, input.business, "commercial_transport");
        if (trip.status !== "requested")
          throw new ApiError(409, "Transport request already assigned");
        return json(
          await db.TransportQuote.create({ ...input, request: trip._id }),
          201,
        );
      }
    }
    const charterAccept = path.match(
      /^business-transport\/quotes\/([a-f0-9]{24})\/accept$/i,
    );
    if (charterAccept && method === "POST") {
      return json(
        await mongoose.connection.transaction(async (session) => {
          const quote = await db.TransportQuote.findOne({
            _id: charterAccept[1],
            status: "offered",
          }).session(session);
          if (!quote) throw new ApiError(404, "Quote not found");
          const trip = await db.TransportRequest.findById(
            quote.request,
          ).session(session);
          if (!trip) throw new ApiError(404, "Transport request not found");
          owns(actor, trip.customer);
          if (trip.status !== "requested")
            throw new ApiError(409, "Transport request already assigned");
          if (
            !(await db.Business.exists({
              _id: quote.business,
              active: true,
              types: "commercial_transport",
              verified: true,
            }).session(session))
          )
            throw new ApiError(409, "Transport provider unavailable");
          trip.status = "assigned";
          quote.status = "accepted";
          await trip.save({ session });
          await quote.save({ session });
          return quote;
        }),
      );
    }
    const histories = {
      "farming/orders": db.Order,
      "transport/bookings": db.Booking,
      "rentals/reservations": db.Reservation,
      "logistics/requests": db.Delivery,
      "business-transport/requests": db.TransportRequest,
    };
    if (method === "GET" && path in histories) {
      const filter = url.searchParams.get("business");
      if (filter) await manage(actor, id.parse(filter), path === 'farming/orders' ? 'farm' : path === 'transport/bookings' ? 'taxi_operator' : path === 'rentals/reservations' ? 'trailer_rental' : path === 'logistics/requests' ? 'logistics' : 'commercial_transport');
      return list(
        histories[path as keyof typeof histories],
        filter ? { business: filter } : { customer: actor.id },
        url,
      );
    }
    throw new ApiError(404, "Endpoint not found");
  } catch (error) {
    if (error instanceof ApiError || error instanceof ImageError)
      return Response.json(
        { error: { message: error.message } },
        { status: error.status, headers },
      );
    if (error instanceof z.ZodError)
      return Response.json(
        { error: { message: "Validation failed", issues: error.issues } },
        { status: 400, headers },
      );
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    )
      return Response.json(
        { error: { message: "Resource already exists" } },
        { status: 409, headers },
      );
    console.error(
      "API request failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return Response.json(
      { error: { message: "Service temporarily unavailable" } },
      { status: 503, headers },
    );
  }
}
