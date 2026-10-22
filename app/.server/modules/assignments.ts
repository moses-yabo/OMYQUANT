import { z } from 'zod';
import * as db from '../database/models';
import type { Actor } from '../shared/access';
import { ApiError, id } from '../shared/http';
import { approvedBusinessFilter } from '../../lib/business-registry';

async function assignmentScope(actor: Actor) {
  const businesses = await db.Business.distinct('_id', approvedBusinessFilter());
  const drivers = await db.Driver.distinct('_id', { user: actor.id, business: { $in: businesses }, active: { $ne: false } });
  const vehicles = await db.Vehicle.distinct('_id', { driver: { $in: drivers }, business: { $in: businesses } });
  return { drivers, vehicles, businesses };
}
export async function myAssignments(actor: Actor) {
  const { drivers, vehicles, businesses } = await assignmentScope(actor);
  const [departures, deliveries] = await Promise.all([
    db.Departure.find({ vehicle: { $in: vehicles }, business: { $in: businesses }, status: { $in: ['scheduled', 'departed'] } }).select('_id vehicle startsAt status remaining capacity').sort({ startsAt: 1 }).limit(100).lean(),
    db.Delivery.find({ driver: { $in: drivers }, business: { $in: businesses }, status: { $in: ['assigned', 'collected'] } }).select('_id pickup dropoff description status').sort({ updatedAt: -1 }).limit(100).lean(),
  ]);
  return { departures, deliveries };
}
export async function updateMyAssignment(actor: Actor, kind: string, recordId: string, body: unknown) {
  id.parse(recordId);
  const { drivers, vehicles, businesses } = await assignmentScope(actor);
  if (kind === 'departure') {
    const input = z.object({ status: z.enum(['departed', 'completed']) }).strict().parse(body);
    const record = await db.Departure.findOneAndUpdate({ _id: recordId, vehicle: { $in: vehicles }, business: { $in: businesses }, status: input.status === 'departed' ? 'scheduled' : 'departed' }, { $set: input }, { new: true });
    if (!record) throw new ApiError(409, 'Assigned trip unavailable or status changed');
    return record;
  }
  if (kind === 'delivery') {
    const input = z.object({ status: z.enum(['collected', 'delivered']), proof: z.url().optional() }).strict().parse(body);
    if (input.status === 'delivered' && !input.proof) throw new ApiError(400, 'Proof of delivery required');
    const record = await db.Delivery.findOneAndUpdate({ _id: recordId, driver: { $in: drivers }, business: { $in: businesses }, status: input.status === 'collected' ? 'assigned' : 'collected' }, { $set: input }, { new: true });
    if (!record) throw new ApiError(409, 'Assigned delivery unavailable or status changed');
    return record;
  }
  throw new ApiError(404, 'Assignment type not found');
}
