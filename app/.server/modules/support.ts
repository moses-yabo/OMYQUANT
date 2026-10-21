import { z } from "zod";
import * as db from "../database/models";
import type { Actor } from "../shared/access";
import { ApiError, id, page } from "../shared/http";
import { complaintCategories, complaintStatuses } from "../../lib/support";
import { requireAdminActor } from "./admin";
import { publishSupportChange } from '../../../scripts/support-events.js';

const category = z.enum(
  Object.keys(complaintCategories) as [
    keyof typeof complaintCategories,
    ...(keyof typeof complaintCategories)[],
  ],
);
const status = z.enum(
  Object.keys(complaintStatuses) as [
    keyof typeof complaintStatuses,
    ...(keyof typeof complaintStatuses)[],
  ],
);
const relatedModels = {
  order: db.Order,
  booking: db.Booking,
  reservation: db.Reservation,
  delivery: db.Delivery,
  transport: db.TransportRequest,
};
const relatedKind = z.enum([
  "order",
  "booking",
  "reservation",
  "delivery",
  "transport",
]);
export async function createComplaint(actor: Actor, body: unknown) {
  const input = z
    .object({
      category,
      subject: z.string().trim().min(3).max(160),
      description: z.string().trim().min(1).max(4000),
      channel: z.enum(['complaint', 'chat']).optional(),
      relatedKind: relatedKind.optional(),
      relatedId: id.optional(),
    })
    .strict()
    .refine(value => value.channel === 'chat' || value.description.length >= 10, 'Describe the complaint in at least 10 characters')
    .refine(
      (value) => Boolean(value.relatedKind) === Boolean(value.relatedId),
      "Choose a record type and reference together",
    )
    .parse(body);
  if (input.relatedKind && input.relatedId) {
    const record = await relatedModels[input.relatedKind]
      .findById(input.relatedId)
      .lean();
    if (
      !record ||
      (!actor.admin &&
        String(record.customer) !== actor.id &&
        !(
          record.business &&
          (await db.Membership.exists({
            business: record.business,
            user: actor.id,
          }))
        ))
    )
      throw new ApiError(
        403,
        "You can only link your own transaction or a transaction for your business",
      );
  }
  const ticket = await db.SupportTicket.create({ ...input, reporter: actor.id });
  publishSupportChange({ ticketId: String(ticket._id), reporter: actor.id });
  return ticket;
}
export async function complaintQueue(
  actor: Actor,
  url: URL,
  administrative = false,
) {
  if (administrative) requireAdminActor(actor);
  const { page: current, limit } = page.parse(
    Object.fromEntries(url.searchParams),
  );
  const filter: Record<string, unknown> = administrative
    ? {}
    : { reporter: actor.id };
  const selectedStatus =
    url.searchParams.get("status") ?? (administrative ? "active" : "all");
  if (selectedStatus === "active")
    filter.status = { $in: ["open", "in_review"] };
  else if (selectedStatus !== "all")
    filter.status = status.parse(selectedStatus);
  if (url.searchParams.get("category"))
    filter.category = category.parse(url.searchParams.get("category"));
  const [tickets, total] = await Promise.all([
    db.SupportTicket.find(filter)
      .select(
        "subject category status reporter createdAt updatedAt relatedKind relatedId",
      )
      .sort({ updatedAt: -1, _id: -1 })
      .skip((current - 1) * limit)
      .limit(limit)
      .lean(),
    db.SupportTicket.countDocuments(filter),
  ]);
  return { tickets, total, page: current, limit };
}
export async function complaintDetail(
  actor: Actor,
  ticketId: string,
  administrative = false,
) {
  if (administrative) requireAdminActor(actor);
  const ticket = await db.SupportTicket.findOne({
    _id: id.parse(ticketId),
    ...(!administrative ? { reporter: actor.id } : {}),
  })
    .populate("reporter", "name")
    .populate("history.author", "name")
    .lean();
  if (!ticket) throw new ApiError(404, "Complaint not found");
  return {
    ...ticket,
    history: administrative
      ? ticket.history
      : ticket.history.filter(
          (event: { internal?: boolean }) => !event.internal,
        ),
  };
}
export async function updateComplaint(
  actor: Actor,
  ticketId: string,
  body: unknown,
  administrative = false,
) {
  if (administrative) requireAdminActor(actor);
  const input = z
    .object({
      message: z.string().trim().min(1).max(4000),
      version: z.number().int().min(0),
      internal: z.boolean().default(false),
      status: status.optional(),
    })
    .strict()
    .parse(body);
  if (!administrative && (input.internal || input.status))
    throw new ApiError(
      403,
      "Only support administrators can set status or add internal notes",
    );
  let nextStatus = input.status;
  if (!administrative) {
    const existing = await db.SupportTicket.findOne({ _id: id.parse(ticketId), reporter: actor.id }).select('status').lean();
    if (!existing) throw new ApiError(404, 'Complaint not found');
    if (existing.status === 'resolved' || existing.status === 'closed') nextStatus = 'open';
  }
  const updated = await db.SupportTicket.findOneAndUpdate(
    {
      _id: id.parse(ticketId),
      version: input.version,
      ...(!administrative ? { reporter: actor.id } : {}),
      "history.99": { $exists: false },
    },
    {
      $set: nextStatus ? { status: nextStatus } : {},
      $inc: { version: 1 },
      $push: {
        history: {
          author: actor.id,
          text: input.message,
          internal: input.internal,
          ...(nextStatus ? { status: nextStatus } : {}),
          createdAt: new Date(),
        },
      },
    },
    { new: true, runValidators: true },
  ).select("_id reporter");
  if (!updated)
    throw new ApiError(
      409,
      "Complaint changed, is unavailable or has reached its reply limit. Refresh before trying again.",
    );
  if (updated.reporter) publishSupportChange({ ticketId: String(updated._id), reporter: String(updated.reporter), staffOnly: input.internal && !nextStatus });
  return { _id: updated._id };
}
