import mongoose from "mongoose";
import { businessSubmissionId } from "../modules/business-submission";
import { autoGeocodeLocation } from "../modules/geocoding";
import { businessRegistry, businessPermissions } from "../../lib/business-registry";
import { validateBusinessDocuments } from "../database/business-documents";
import { z } from "zod";
import { verifyBusiness } from "../modules/admin";
import * as db from "../database/models";
import { businessSchema } from "../modules/resources";
import { manage } from "../shared/access";
import { ApiError, id } from "../shared/http";
import type { ApiContext } from "./context";
import { json, body, list } from "./http";


export async function businessDetails({ request, path, method, actor }: ApiContext): Promise<Response | undefined> {
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
      if (input.kind && !input.types)
        throw new ApiError(
          400,
          "Provide service types when changing business type",
        );
      if (
        input.kind &&
        input.types &&
        !businessRegistry[input.kind].services.every((type) =>
          input.types!.includes(type),
        )
      )
        throw new ApiError(400, "Business type and services do not match");
      if (
        input.types &&
        !input.kind &&
        company.kind &&
        !businessRegistry[
          company.kind as keyof typeof businessRegistry
        ].services.every((type) => input.types!.includes(type))
      )
        throw new ApiError(
          400,
          "Update the business type to match its services",
        );
      if (input.verificationDocuments)
        await validateBusinessDocuments(
          actor.id,
          input.verificationDocuments,
        );
      if (input.locations) {
        input.locations.forEach((location, index) => {
          const old = company.locations?.[index];
          if (
            old?.address?.trim().toLowerCase() !==
              location.address.toLowerCase() ||
            old?.province?.trim().toLowerCase() !==
              location.province.toLowerCase()
          )
            return;
          const noPin =
            location.latitude === undefined &&
            location.longitude === undefined;
          if (
            noPin ||
            (location.latitude === old.latitude &&
              location.longitude === old.longitude)
          )
            Object.assign(location, {
              latitude: old.latitude,
              longitude: old.longitude,
              ...(old.geocoding ? { geocoding: old.geocoding } : {}),
            });
        });
        input.locations[0] = await autoGeocodeLocation(
          input.locations[0],
          actor.id,
        );
      }
      return json(
        await db.Business.findByIdAndUpdate(
          company._id,
          {
            $set: {
              ...input,
              ...(input.types || input.kind || input.verificationDocuments
                ? { verified: false, verificationStatus: "PENDING" }
                : {}),
            },
          },
          { new: true, runValidators: true },
        ),
      );
    }
  }
  const dashboardMatch = path.match(
    /^farming\/farmers\/([a-f0-9]{24})\/dashboard$/i,
  );
  if (dashboardMatch && method === "GET") {
    await manage(actor, dashboardMatch[1], "farm", false, "read");
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
}

export async function businessMemberships({ request, path, method, url, actor }: ApiContext): Promise<Response | undefined> {
  if (path === "businesses") {
    if (method === "POST") {
      const input = businessSchema.parse(await body(request));
      const submissionId = businessSubmissionId(actor.id, request.headers.get("Idempotency-Key"));
      if (submissionId) {
        const previous = await db.Business.findOne({ _id: submissionId, owner: actor.id });
        if (previous) return json(previous, 200);
      }
      if (
        !input.verificationDocuments?.length ||
        (input.kind &&
          !businessRegistry[input.kind].services.every((type) =>
            input.types.includes(type),
          ))
      )
        throw new ApiError(
          400,
          "Select matching services and upload the required verification documents",
        );
      await validateBusinessDocuments(
        actor.id,
        input.verificationDocuments ?? [],
      );
      input.locations[0] = await autoGeocodeLocation(
        input.locations[0],
        actor.id,
      );
      let company;
      try {
        company = await mongoose.connection.transaction(
          async (session) => {
            const [company] = await db.Business.create(
              [
                {
                  ...input,
                  ...(submissionId ? { _id: new mongoose.Types.ObjectId(submissionId) } : {}),
                  owner: actor.id,
                  verified: false,
                  verificationStatus: "PENDING",
                },
              ],
              { session },
            );
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
      } catch (error) {
        if (submissionId && error instanceof Error && "code" in error && error.code === 11000) {
          const previous = await db.Business.findOne({ _id: submissionId, owner: actor.id });
          if (previous) return json(previous, 200);
        }
        throw error;
      }
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
    const memberCompany = await manage(
      actor,
      membershipMatch[1],
      undefined,
      true,
    );
    if (method === "GET")
      return list(db.Membership, { business: membershipMatch[1] }, url);
    if (method === "POST") {
      const input = z
        .object({
          user: id,
          role: z.enum(["manager", "staff"]),
          permissions: z
            .array(
              z
                .string()
                .refine((value) => businessPermissions.includes(value)),
            )
            .max(10)
            .default([]),
        })
        .strict()
        .parse(await body(request));
      if (!(await db.User.exists({ _id: input.user, active: true })))
        throw new ApiError(400, "User not found");
      input.permissions = [
        ...new Set(
          input.permissions.flatMap((permission) =>
            permission.endsWith(":write")
              ? [permission, permission.replace(":write", ":read")]
              : [permission],
          ),
        ),
      ];
      if (
        input.permissions.some(
          (permission) =>
            !memberCompany.types.includes(permission.split(":")[0]),
        )
      )
        throw new ApiError(
          400,
          "Membership permissions must match this business services",
        );
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
    return json(
      await verifyBusiness(actor, verificationMatch[1], await body(request)),
    );
  }
}
