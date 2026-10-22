import mongoose from 'mongoose';
import { z } from 'zod';
import { Business, BusinessReview, Membership, User, AdminAccessReview } from '../database/models';
import { verificationStatus, verificationStatuses } from '../../lib/business-registry';
import { ApiError, page } from '../shared/http';
import type { Actor } from '../shared/access';

export function requireAdminActor(actor: Actor) {
  if (!actor.admin) throw new ApiError(403, 'Platform administrator required');
}
export function requireSuperAdmin(actor: Actor) {
  if (!actor.superAdmin) throw new ApiError(403, 'Super administrator required');
}
export async function administrationOverview(actor: Actor) {
  requireSuperAdmin(actor);
  const [pending, verified, administrators, recent] = await Promise.all([
    Business.countDocuments({ verified: { $ne: true } }),
    Business.countDocuments({ verified: true }),
    User.countDocuments({ active: true, admin: true, superAdmin: { $ne: true } }),
    BusinessReview.find().sort({ createdAt: -1, _id: -1 }).limit(8).populate('business', 'name').populate('reviewer', 'name').lean(),
  ]);
  return { pending, verified, administrators, recent };
}
export async function findAdminAccount(actor: Actor, email: string) {
  requireSuperAdmin(actor);
  const normalized = z.email().parse(email.trim().toLowerCase());
  const user = await User.findOne({ email: normalized, active: true }).select('_id name email admin superAdmin').lean();
  if (!user) throw new ApiError(404, 'No active account found. The person must register first.');
  return user;
}
export async function setAdminAccess(actor: Actor, id: string, body: unknown) {
  requireSuperAdmin(actor);
  const input = z.object({ admin: z.boolean() }).strict().parse(body);
  // Protect super administrators atomically, including against concurrent promotion.
  await AdminAccessReview.init();
  return mongoose.connection.transaction(async session => {
    const user = await User.findOneAndUpdate({ _id: id, active: true, superAdmin: { $ne: true } }, { $set: input }, { new: true, runValidators: true, session }).select('_id name email admin superAdmin');
    if (!user) throw new ApiError(409, 'Account is inactive, missing or a protected super administrator.');
    await AdminAccessReview.create([{ user: id, reviewer: actor.id, admin: input.admin }], { session });
    return user;
  });
}
export async function businessQueue(actor: Actor, url: URL) {
  requireAdminActor(actor);
  const { page: current, limit } = page.parse(Object.fromEntries(url.searchParams));
  const status = z.enum(['pending', 'verified', 'all', ...verificationStatuses]).parse(url.searchParams.get('status') ?? 'pending');
  const effective = status === 'pending' ? 'PENDING' : status === 'verified' ? 'APPROVED' : status;
  const filter: Record<string, unknown> = status === 'all' ? {} : { $or: [{ verificationStatus: effective }, ...(effective === 'APPROVED' || effective === 'PENDING' ? [{ verificationStatus: { $exists: false }, verified: effective === 'APPROVED' ? true : { $ne: true } }] : [])] };
  const query = url.searchParams.get('q')?.trim().slice(0, 100);
  if (query) filter.name = { $regex: query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  const [businesses, total] = await Promise.all([
    Business.find(filter).sort({ createdAt: -1, _id: -1 }).skip((current - 1) * limit).limit(limit).lean(),
    Business.countDocuments(filter),
  ]);
  return { businesses, total, page: current, limit };
}
export async function businessReview(actor: Actor, businessId: string) {
  requireAdminActor(actor);
  const business = await Business.findById(businessId).lean();
  if (!business) throw new ApiError(404, 'Business not found');
  const reviews = await BusinessReview.find({ business: businessId }).sort({ createdAt: -1, _id: -1 }).limit(50).populate('reviewer', 'name').lean();
  return { business, reviews };
}
export async function verifyBusiness(actor: Actor, businessId: string, body: unknown) {
  requireAdminActor(actor);
  const input = z.object({ verified: z.boolean().optional(), status: z.enum(verificationStatuses).optional(), reason: z.string().trim().max(2000).default('') }).strict().refine(value => value.status !== undefined || value.verified !== undefined).refine(value => value.status === undefined || value.verified === undefined).parse(body);
  const status = input.status ?? (input.verified ? 'APPROVED' : 'PENDING');
  if (['REJECTED', 'SUSPENDED'].includes(status) && !input.reason) throw new ApiError(400, 'A decision reason is required');
  // Ensure the new audit collection exists before entering a transaction.
  await BusinessReview.init();
  return mongoose.connection.transaction(async session => {
    const business = await Business.findById(businessId).session(session);
    if (!business) throw new ApiError(404, 'Business not found');
    if (String(business.owner) === actor.id || await Membership.exists({ business: businessId, user: actor.id }).session(session)) throw new ApiError(403, 'You cannot review a business you belong to');
    if (verificationStatus(business) === status) throw new ApiError(409, 'Business already has this verification status');
    const previousStatus = verificationStatus(business);
    business.verified = status === 'APPROVED';
    business.verificationStatus = status;
    business.verification = { reviewer: actor.id, reviewedAt: new Date(), reason: input.reason };
    await business.save({ session });
    await BusinessReview.create([{ business: business._id, reviewer: actor.id, verified: business.verified, previousStatus, status, reason: input.reason }], { session });
    return business;
  });
}
