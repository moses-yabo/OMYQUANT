import { approvedBusinessFilter, hasBusinessPermission } from "../../lib/business-registry";
import { z } from "zod";
import { validateListingImages } from "../database/images";
import * as db from "../database/models";
import { resources } from "../modules/resources";
import { manage } from "../shared/access";
import { ApiError, id } from "../shared/http";
import type { ApiContext } from "./context";
import { json, body, list } from "./http";


export async function resourceRoutes({ request, path, method, url, actor }: ApiContext): Promise<Response | undefined> {
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
        await manage(
          actor,
          id.parse(managedBusiness),
          resource.type,
          false,
          "read",
        );
        filter.business = managedBusiness;
      }
      if (!resource.public && !managedBusiness) {
        const memberships = await db.Membership.find({ user: actor.id })
          .select("business role permissions")
          .lean();
        const permitted = memberships
          .filter((member) =>
            hasBusinessPermission(
              member as unknown as { role: string; permissions?: string[] },
              resource.type,
              "read",
            ),
          )
          .map((member) => member.business);
        filter.business = {
          $in: await db.Business.distinct("_id", {
            ...approvedBusinessFilter(),
            types: resource.type,
            _id: { $in: permitted },
          }),
        };
      }
      if (resource.public && !managedBusiness)
        filter.business = {
          $in: await db.Business.distinct("_id", {
            ...approvedBusinessFilter(),
            types: resource.type,
          }),
        };
      if (
        !managedBusiness &&
        (key === "farming/products" || key === "farming/livestock")
      )
        filter.status = "published";
      if (key === "rentals/trailers" && !managedBusiness)
        filter.active = true;
      return list(resource.model, filter, url);
    }
    if (method === "POST" && !recordId) {
      const input = resource.schema.parse(await body(request));
      await manage(actor, input.business, resource.type);
      if ("images" in input)
        input.images = await validateListingImages(
          String(input.business),
          input.images,
        );
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
      if ("images" in input)
        input.images = await validateListingImages(
          String(existing.business),
          input.images as string[],
        );
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
}
