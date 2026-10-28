import { businessMapData, setBusinessPin, geocodeBusinessLocation, confirmBusinessAddress } from "../modules/business-map";
import { businessWorkspaces } from "../modules/business-workspaces";
import { myAssignments, updateMyAssignment } from "../modules/assignments";
import { approvedBusinessFilter } from "../../lib/business-registry";
import { z } from "zod";
import { businessQueue, businessReview, findAdminAccount } from "../modules/admin";
import * as db from "../database/models";
import { createComplaint, complaintQueue, complaintDetail, updateComplaint } from "../modules/support";
import { manage } from "../shared/access";
import { ApiError, id, text } from "../shared/http";
import type { ApiContext } from "./context";
import { json, body, list } from "./http";


export async function operationalRoutes({ request, path, method, url, actor }: ApiContext): Promise<Response | undefined> {
  if (path === "admin/business-map" && method === "GET")
    return json(await businessMapData(actor));
  const pinMatch = path.match(
    /^admin\/businesses\/([a-f0-9]{24})\/location$/i,
  );
  if (pinMatch && method === "PATCH")
    return json(
      await setBusinessPin(actor, pinMatch[1], await body(request)),
    );
  const geocodeMatch = path.match(
    /^admin\/businesses\/([a-f0-9]{24})\/geocode$/i,
  );
  if (geocodeMatch && method === "POST")
    return json(
      await geocodeBusinessLocation(
        actor,
        geocodeMatch[1],
        await body(request),
      ),
    );
  if (geocodeMatch && method === "PATCH")
    return json(
      await confirmBusinessAddress(
        actor,
        geocodeMatch[1],
        await body(request),
      ),
    );
  if (path === "business-workspaces" && method === "GET")
    return json(await businessWorkspaces(actor.id));
  if (path === "enquiries" && method === "GET")
    return list(db.BusinessEnquiry, { customer: actor.id }, url);
  if (path === "farming/enquiries" && method === "GET") {
    const business = id.parse(url.searchParams.get("business"));
    await manage(actor, business, "farm", false, "read");
    return list(db.BusinessEnquiry, { business }, url);
  }
  if (path === "enquiries" && method === "POST") {
    const input = z
      .object({
        listing: id,
        kind: z.enum(["product", "livestock"]),
        question: z.string().trim().min(1).max(4000),
      })
      .strict()
      .parse(await body(request));
    const listing = await (
      input.kind === "product" ? db.Product : db.Livestock
    ).findOne({ _id: input.listing, status: "published" });
    if (
      !listing ||
      !(await db.Business.exists({
        _id: listing.business,
        ...approvedBusinessFilter(),
        types: "farm",
      }))
    )
      throw new ApiError(404, "Listing unavailable");
    return json(
      await db.BusinessEnquiry.create({
        ...input,
        customer: actor.id,
        business: listing.business,
      }),
      201,
    );
  }
  const enquiry = path.match(/^farming\/enquiries\/([a-f0-9]{24})$/i);
  if (enquiry && method === "PATCH") {
    const record = await db.BusinessEnquiry.findById(enquiry[1]);
    if (!record) throw new ApiError(404, "Enquiry not found");
    await manage(actor, record.business, "farm");
    const input = z
      .object({ answer: z.string().trim().min(1).max(4000) })
      .strict()
      .parse(await body(request));
    return json(
      await db.BusinessEnquiry.findByIdAndUpdate(
        record._id,
        { $set: { ...input, answeredBy: actor.id, answeredAt: new Date() } },
        { new: true },
      ),
    );
  }
  if (path === "work" && method === "GET")
    return json(await myAssignments(actor));
  const workMatch = path.match(
    /^work\/(departure|delivery)\/([a-f0-9]{24})$/i,
  );
  if (workMatch && method === "PATCH")
    return json(
      await updateMyAssignment(
        actor,
        workMatch[1],
        workMatch[2],
        await body(request),
      ),
    );
  const supportMatch = path.match(
    /^(admin\/)?support(?:\/([a-f0-9]{24}))?$/i,
  );
  if (supportMatch) {
    const administrative = Boolean(supportMatch[1]);
    const ticket = supportMatch[2];
    if (method === "GET")
      return json(
        ticket
          ? await complaintDetail(actor, ticket, administrative)
          : await complaintQueue(actor, url, administrative),
      );
    if (method === "POST" && !ticket && !administrative)
      return json(await createComplaint(actor, await body(request)), 201);
    if (method === "PATCH" && ticket)
      return json(
        await updateComplaint(
          actor,
          ticket,
          await body(request),
          administrative,
        ),
      );
  }
  if (path === "admin/users" && method === "GET")
    return json(
      await findAdminAccount(actor, url.searchParams.get("email") ?? ""),
    );
  if (path === "admin/businesses" && method === "GET")
    return json(await businessQueue(actor, url));
  const adminBusiness = path.match(/^admin\/businesses\/([a-f0-9]{24})$/i);
  if (adminBusiness && method === "GET")
    return json(await businessReview(actor, adminBusiness[1]));
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
}
