import mongoose from 'mongoose';
import { z } from 'zod';
import { Business, BusinessLocationReview } from '../database/models';
import { requireAdminActor } from './admin';
import type { Actor } from '../shared/access';
import { ApiError } from '../shared/http';
import type { BusinessMapRecord } from '../../lib/business-map';
import { geocodeAddress } from './geocoding';

export async function businessMapData(actor: Actor) {
  requireAdminActor(actor);
  const [businesses, total] = await Promise.all([
    Business.find().select('_id name types active verified verificationStatus locations').sort({ createdAt: -1, _id: -1 }).limit(1000).lean(),
    Business.countDocuments({}),
  ]);
  const records = JSON.parse(JSON.stringify(businesses)) as BusinessMapRecord[];
  return { businesses: records.map(record => ({ ...record, types: record.types ?? [], locations: record.locations ?? [] })), total, limit: 1000 };
}
export async function geocodeBusinessLocation(actor: Actor, businessId: string, body: unknown) {
  requireAdminActor(actor);
  const input = z.object({ index: z.number().int().min(0).max(49) }).strict().parse(body);
  const business = await Business.findById(businessId).lean();
  const location = business?.locations?.[input.index];
  if (!location) throw new ApiError(404, 'Business location not found');
  return { matches: await geocodeAddress(location.address, location.province, actor.id), address: location.address, province: location.province, index: input.index };
}
export async function confirmBusinessAddress(actor: Actor, businessId: string, body: unknown) {
  requireAdminActor(actor);
  const input = z.object({ index: z.number().int().min(0).max(49), candidate: z.string().min(1).max(2000), address: z.string(), province: z.string() }).strict().parse(body);
  const found = await geocodeBusinessLocation(actor, businessId, { index: input.index });
  if (found.address !== input.address || found.province !== input.province) throw new ApiError(409, 'The address changed. Look it up again before saving.');
  const match = found.matches.find(match => match.id === input.candidate);
  if (!match) throw new ApiError(409, 'Address match expired. Look up the address again.');
  await BusinessLocationReview.init();
  return mongoose.connection.transaction(async session => {
    const business = await Business.findById(businessId).session(session);
    const location = business?.locations[input.index];
    if (!location || location.address !== input.address || location.province !== input.province) throw new ApiError(409, 'The address changed. Look it up again before saving.');
    const previous = { latitude: location.latitude, longitude: location.longitude };
    location.latitude = match.latitude; location.longitude = match.longitude;
    location.geocoding = { provider: 'geoapify', label: match.label, precision: match.precision, confidence: match.confidence, reviewed: true, locatedAt: new Date() };
    await business.save({ session });
    await BusinessLocationReview.create([{ business: businessId, reviewer: actor.id, locationIndex: input.index, previous, coordinates: { latitude: match.latitude, longitude: match.longitude } }], { session });
    return { latitude: match.latitude, longitude: match.longitude };
  });
}
export async function setBusinessPin(actor: Actor, businessId: string, body: unknown) {
  requireAdminActor(actor);
  const input = z.object({ index: z.number().int().min(0).max(49), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).strict().parse(body);
  await BusinessLocationReview.init();
  return mongoose.connection.transaction(async session => {
    const business = await Business.findById(businessId).session(session);
    const location = business?.locations[input.index];
    if (!location) throw new ApiError(404, 'Business location not found');
    const previous = { latitude: location.latitude, longitude: location.longitude };
    location.latitude = input.latitude; location.longitude = input.longitude;
    location.geocoding = undefined;
    await business.save({ session });
    await BusinessLocationReview.create([{ business: businessId, reviewer: actor.id, locationIndex: input.index, previous, coordinates: { latitude: input.latitude, longitude: input.longitude } }], { session });
    return { latitude: input.latitude, longitude: input.longitude };
  });
}
